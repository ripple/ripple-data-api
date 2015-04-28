var moment = require('moment');
var tools  = require('../utils');
var ripple = require('ripple-lib');
var _      = require('underscore');

var intervals = {
  minute : [1,5,15,30],
  hour   : [1,2,4],
  day    : [1,3,7],
  month  : [1,3]
}

var header = [
  'startTime',
  'baseVolume',
  'counterVolume',
  'count',
  'open',
  'high',
  'low',
  'close',
  'vwap',
  'openTime',
  'closeTime',
];

var unreducedHeader = [
  'time',
  'price',
  'baseAmount',
  'counterAmount',
  'account',
  'counterparty',
  'tx_hash'
];

module.exports = function (params, callback) {

  var options = {};

  if (!params.base || !params.counter) {
    callback('please specify base and counter currencies');
    return;
  }

  if (!params.base || !params.base.currency) {
    callback('please specify a base currency');
    return;

  } else if (!params.counter || !params.counter.currency) {
    callback('please specify a base currency');
    return;
  }

  options.base    = params.base.currency.toUpperCase();
  options.counter = params.counter.currency.toUpperCase();

  if (options.base !== 'XRP' && !params.base.issuer) {
    callback('please specifiy a base issuer');
    return;

  } else if (options.counter !== 'XRP' && !params.counter.issuer) {
    callback('please specifiy a counter issuer');
    return;
  }

  //Parse start and end times
  options.time = tools.parseTimeRange(params.startTime, params.endTime, params.descending);

  if (options.time.error) {
    callback(options.time.error);
    return;
  } else if (!options.time.start || !options.time.end) {
    callback("startTime and endTime are required.");
    return;
  }

  if (params.timeIncrement &&
    params.timeIncrement[params.timeIncrement.length-1] === 's') {
    params.timeIncrement = params.timeIncrement.slice(0, -1);
  }

  if (params.timeIncrement === 'week') {
    params.timeIncrement = 'day';
    params.timeMultiple = 7;
  }

  //set format
  options.format = params.format || null;
  options.base = params.base;
  options.counter = params.counter;

  //unaggregated results from couchdb
  if (params.reduce === false) {
    options.unreduced = true;
    getUnreduced(options, params, callback);

  //sum total aggregation from couchdb
  } else if (params.timeIncrement === 'all') {
    getReduced(options, params, callback);

  //aggregated intervals from hbase
  } else {
    getAggregated(options, params, callback);
  }
}

/**
 * getUnreduced
 * get unreduced results directly
 * from couchDB
 */

function getUnreduced(options, params, callback) {

  hbase.getExchanges({
    start      : options.time.start,
    end        : options.time.end,
    base       : params.base,
    counter    : params.counter,
    descending : params.descending || false,
    limit      : params.limit
  }, function(err, resp) {

    var rows = [header];
    if (err) {
      callback(err);
      return;
    }

    resp.forEach(function(row){
      var key = row.rowkey.split('|');

      rows.push([
        tools.unformatTime(key[4]).format(),
        row.rate,
        row.base_amount,
        row.counter_amount,
        row.buyer,  //account
        row.seller, //counterparty
        row.tx_hash,
        parseInt(row.ledger_index, 10)
      ]);
    });

    handleResponse(rows, options, callback);
  });
}

/**
 * getReduced
 * get fully reduced results
 * from couchDB
 */

function getReduced(options, params, callback) {

  hbase.getExchanges({
    start      : options.time.start,
    end        : options.time.end,
    base       : params.base,
    counter    : params.counter,
    reduce     : true

  }, function(err, resp) {

    if (err) {
      callback(err);
      return;
    }

    handleResponse([
      [header], [
      options.time.start,
      resp.base_volume,
      resp.counter_volume,
      resp.count,
      resp.open,
      resp.high,
      resp.low,
      resp.close,
      resp.counter_amount / resp.base_volume,
      resp.open_time,
      resp.close_time
    ]], options, callback);
  });
}

/**
 * getAggregated
 * get aggregated results from hbase
 */

function getAggregated (options, params, callback) {

  if (!params.interval) {
    params.interval = (params.timeMultiple || 1) + (params.timeIncrement || 'hour');
  }

  hbase.getExchanges({
    interval : params.interval,
    start    : options.time.start,
    end      : options.time.end,
    base     : params.base,
    counter  : params.counter
  }, function(err, resp) {

    var rows = [header];
    if (err) {
      callback(err);
      return;
    }

    resp.forEach(function(row) {
      rows.push([
        row.start, //start time
        row.base_volume,
        row.counter_volume,
        row.count,
        row.open,
        row.high,
        row.low,
        row.close,
        row.vwap,
        moment.unix(row.open_time).utc(),  //open  time
        moment.unix(row.close_time).utc(), //close time
      ]);
    });

    handleResponse(rows, options, callback);
  });
}

/**
 * handleResponse
 * prepare data for response
 */

function handleResponse (rows, options, callback) {
  var apiRes = {};

  //CSV output
  if (options.format === 'csv') {
    var csvStr = _.map(rows, function(row){
      return row.join(', ');
    }).join('\n');

    // provide output as CSV
    return callback(null, csvStr);

  //JSON output
  } else if (options.format === 'json') {

    apiRes.startTime     = moment.utc(options.startTime).format();
    apiRes.endTime       = moment.utc(options.endTime).format();
    apiRes.base          = options.base;
    apiRes.counter       = options.counter;
    apiRes.timeIncrement = options.increment;
    if (options.multiple && options.multiple>1) apiRes.timeMultiple = options.multiple;

    rows.shift();//get rid of header

    if (options.unreduced) {
      apiRes.results = _.map(rows, function(row){
        return {
          time          : row[0],
          price         : row[1],
          baseAmount    : row[2],
          counterAmount : row[3],
          account       : row[4],
          counterparty  : row[5],
          tx_hash       : row[6],
          ledgerIndex   : row[7]
        };
      });

    } else {

      apiRes.results = _.map(rows, function(row, index){
        return {
          startTime     : moment.utc(row[0]).format(),
          openTime      : moment.utc(row[9]).format(),
          closeTime     : moment.utc(row[10]).format(),
          baseVolume    : row[1],
          counterVolume : row[2],
          count         : row[3],
          open          : row[4],
          high          : row[5],
          low           : row[6],
          close         : row[7],
          vwap          : row[8],
          partial       : row[11],
        };
      });
    }

    callback (null, apiRes);

  //no format or incorrect format specified
  } else {
    return callback (null, rows);
  }
}
