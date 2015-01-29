var moment = require('moment');
var tools  = require('../utils');
var ripple = require('ripple-lib');
    
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
  
  //unaggregated results from couchdb
  if (params.reduce === false) {
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
  var base    = options.base    + (params.base.issuer ? '.' + params.base.issuer : '');
  var counter = options.counter + (params.counter.issuer ? '.' + params.counter.issuer : '');
  var keyBase;
  
  options.descending = params.descending || false; 
  options.unreduced  = true;
  options.offset     = params.offset || 0;
  options.limit      = params.limit  || 500;

  if (base < counter) {
    keyBase = base + ':' + counter;
    options.invert  = true;

  } else {
    keyBase = counter + ':' + base;
  }
  
  var view = {
    startkey   : [keyBase].concat(options.time.start.toArray().slice(0,6)),
    endkey     : [keyBase].concat(options.time.end.toArray().slice(0,6)),
    reduce     : false,
    descending : options.descending,
    limit      : options.limit,
    offset     : options.offset
  };
  
  db.view("offersExercisedV3", "v2", view, function (err, resp){        
    var rows = [unreducedHeader];
    
    if (err) {
      callback ('CouchDB - ' + err);  
      return;
    }
    
    resp.rows.forEach(function(row){
      var time = row.key ? row.key.slice(1) : row.value[5];
      rows.push([
        moment.utc(time).format(),
        row.value[2],         //price
        row.value[1],         //get amount
        row.value[0],         //pay amount
        row.value[3],         //account
        row.value[4],         //counterparty
        row.value[6],         //tx hash
        parseInt(row.id, 10)  //ledger index
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
  var base    = options.base    + (params.base.issuer ? '.' + params.base.issuer : '');
  var counter = options.counter + (params.counter.issuer ? '.' + params.counter.issuer : '');
  var keyBase;

  if (base < counter) {
    keyBase = base + ':' + counter;
    options.invert = true;

  } else {
    keyBase = counter + ':' + base;
  }
  
  var view = {
    startkey   : [keyBase].concat(options.time.start.toArray().slice(0,6)),
    endkey     : [keyBase].concat(options.time.end.toArray().slice(0,6)),
  };
  
  db.view("offersExercisedV3", "v2", view, function (err, resp){ 
    var rows = [header];
    
    if (err || !resp || !resp.rows) {
      callback ('CouchDB - ' + err);  
      return;
    }
  
    if (resp.rows.length) {
      rows.push([
        moment.utc(options.time.start).format(), //start time
        resp.rows[0].value.curr2Volume,
        resp.rows[0].value.curr1Volume,
        resp.rows[0].value.numTrades,
        resp.rows[0].value.open,
        resp.rows[0].value.high,
        resp.rows[0].value.low,
        resp.rows[0].value.close,
        resp.rows[0].value.curr1Volume / resp.rows[0].value.curr2Volume,
        moment.utc(resp.rows[0].value.openTime).format(),  //open  time
        moment.utc(resp.rows[0].value.closeTime).format(), //close time
      ]);
    }

    handleResponse(rows, options, callback);
  });
}

/**
 * getAggregated
 * get aggregated results from hbase
 */

function getAggregated (options, params, callback) {
  var base    = options.base    + '|' + (params.base.issuer    || '');
  var counter = options.counter + '|' + (params.counter.issuer || '');
  var keys    = [];
  var keyBase;
  var start;
  var end;
  var interval;
  var multiple;
  var table;
  
  if (base < counter) {
    keyBase = base + '|' + counter;
    
  } else {
    keyBase = counter + '|' + base;
    options.invert = true;
  }
  
  if (params.interval) {
    multiple = parseInt(params.interval.match(/\d+/)[0], 10); 
    interval = params.interval.match(/[a-z]+/i)[0];
    
    interval = params.timeIncrement || 'hour';
    
  } else {
    multiple = params.timeMultiple  || 1;
    interval = params.timeIncrement || 'hour';
  }
  
  if (!intervals[interval]) {
    callback('invalid time increment');
    return;
  }
  
  if (intervals[interval].indexOf(multiple) === -1) {
    callback('invalid multiple');
    return;
  }
  
  table = 'beta2_agg_exchange_' + multiple + interval;
  start = tools.getAlignedTime(options.time.start, interval, multiple);
  end   = tools.getAlignedTime(options.time.end, interval, multiple).add(multiple, interval);
  
  while (end.diff(start)>0) {
    rowKey = keyBase + '|' + tools.formatTime(start);
    keys.push(rowKey);
    start.add(multiple, interval);

  }
  
  hbase.getRows(table, keys, function (err, resp) {
    var rows = [header];
    if (err) {
      callback(err);
      return;
    }
    
    resp.forEach(function(row) {
      rows.push([
        row.start, //start time
        parseFloat(row.base_volume),
        parseFloat(row.counter_volume),
        parseInt(row.count, 10),
        parseFloat(row.open),
        parseFloat(row.high),
        parseFloat(row.low),
        parseFloat(row.close),
        parseFloat(row.vwap),
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
  
  //invert the base and counter currencies
  if (options.invert) {
    rows = invertPair(rows, options.unreduced);
  }

  //this doesnt really belong here, it should have been calculated in 
  //in the couchDB view, but until that day, this works pretty well.
  rows = handleInterest(rows, options);

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
    apiRes.base          = params.base;
    apiRes.counter       = params.counter;
    apiRes.timeIncrement = options.increment || "all";
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

/**
 * apply interest to interest/demmurage currencies
 * @param {Object} rows
 */

function handleInterest (rows, options) {
  var base    = ripple.Currency.from_json(options.base);
  var counter = ripple.Currency.from_json(options.counter);

  if (base.has_interest()) {
    if (options.unreduced) {
      rows.forEach(function(row, i){
        if (!i) return;

        //apply interest to the base amount
        amount = ripple.Amount.from_human(row[2] + " " + options.base).applyInterest(new Date(row[0])).to_human(); 
        pct   = row[2]/amount; 

        rows[i][2]  = amount;
        rows[i][1] *= pct;         
      });

    } else {
      rows.forEach(function(row, i){
        if (!i) return;

        //apply interest to the base volume
        value = ripple.Amount.from_human(row[1] + " " + options.base).applyInterest(new Date(row[0])).to_human(); 
        pct   = row[1]/value;

        //adjust the prices
        rows[i][1] = value;
        rows[i][4] *= pct;
        rows[i][5] *= pct;
        rows[i][6] *= pct;
        rows[i][7] *= pct;
        rows[i][8] *= pct;
      });
    }
  } else if (counter.has_interest()) {
    if (options.unreduced) {
      rows.forEach(function(row, i){
        if (!i) return;

        //apply interest to the counter amount
        amount = ripple.Amount.from_human(row[3] + " " + options.counter).applyInterest(new Date(row[0])).to_human(); 
        pct   = amount/row[3]; 

        rows[i][3]  = amount;
        rows[i][1] *= pct;         
      });

    } else {         
      rows.forEach(function(row, i){
        if (!i) return;

        //apply interest to the counter volume
        value = ripple.Amount.from_human(row[2] + " " + options.counter).applyInterest(new Date(row[0])).to_human(); 
        pct   = value/row[2];

        //adjust the prices
        rows[i][2] = value;
        rows[i][4] *= pct;
        rows[i][5] *= pct;
        rows[i][6] *= pct;
        rows[i][7] *= pct;
        rows[i][8] *= pct;
      });
    }      
  }

  return rows;
}

/**
* if the base/counter key was inverted, we need to swap
* some of the values in the results
*/

function invertPair (rows, unreduced) {
  var swap;
  var i;

  if (unreduced) {      
    //skip the first, invert the rest
    for (i=1; i<rows.length; i++) { 
      rows[i][1] = 1/rows[i][1];

      //swap base and counter vol
      swap = rows[i][2];
      rows[i][2] = rows[i][3];
      rows[i][3] = swap;

      //swap account and counterparty
      swap = rows[i][4];
      rows[i][4] = rows[i][5];
      rows[i][5] = swap;
    }

  } else {

    //skip the first, invert the rest
    for (i=1; i<rows.length; i++) {

      //swap base and counter vol
      swap = rows[i][1]; 
      rows[i][1] = rows[i][2];
      rows[i][2] = swap; 
      rows[i][4] = 1/rows[i][4];

      //swap high and low
      swap = 1/rows[i][5]; 
      rows[i][5] = 1/rows[i][6];
      rows[i][6] = swap; 
      rows[i][7] = 1/rows[i][7];
      rows[i][8] = 1/rows[i][8];
    }
  }

  return rows;
}
