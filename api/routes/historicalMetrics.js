var tools  = require('../utils');
var moment = require('moment');
var utils  = require('../library/utils');

/*

  request parameters:

    startTime
    endTime - optional defaults to now
    timeIncrement - day or month, defaults to month
    metric - one of: topMarkets, totalValueSent, totalNetworkValue


  curl -H "Content-Type: application/json" -X POST -d '{
    "exchange" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "june 1, 2014 4:44:00 am",
    "timeIncrement" : "week",
    "metric" : "totalnetworkvalue"

    }' http://localhost:5993/api/historicalMetrics

  curl -H "Content-Type: application/json" -X POST -d '{
    "exchange" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "June 29, 2014 4:44:00 am",
    "endTime"   : "june 30, 2014 4:44:00 am",
    "timeIncrement" : "day",
    "metric" : "totalnetworkvalue"

    }' http://localhost:5993/api/historicalMetrics

 *
 */
var getMetric = function (params, callback) {

  var ex        = params.exchange || {currency:"XRP"};
  var result    = tools.parseTimeRange(params.startTime, params.endTime);
  var keys      = [];
  var increment = (params.timeIncrement || 'month').toLowerCase();
  var start     = moment.utc(result.start).startOf(increment);
  var keyBase;

  if (params.metric) params.metric = params.metric.toLowerCase();
  else return callback('metric parameter is required');

  if      (params.metric === 'topmarkets')         keyBase = 'trade_volume|';
  else if (params.metric === 'totalvaluesent')     keyBase = 'transaction_volume|';
  else if (params.metric === 'totalpaymentvolume') keyBase = 'payment_volume|';
  else if (params.metric === 'totalnetworkvalue')  keyBase = 'network_value|';
  else return callback("invalid metric");

  if (result.error) {
    return callback(options.error);
  }

  if (typeof ex != 'object')               return callback('invalid exchange currency');
  else if (!ex.currency)                   return callback('exchange currency is required');
  else if (typeof ex.currency != 'string') return callback('invalid exchange currency');
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return callback('exchange issuer is required');
  else if (ex.currency == "XRP" && ex.issuer)
    return callback('XRP cannot have an issuer');

  if (increment !== 'day' &&
      increment !== 'week' &&
      increment !== 'month' ) {
   return callback('invalid time increment: use "day", "week", or "month"');
  }

  if (result.end.diff(Date.now())>0) {
    result.end = moment.utc();
  }

  keyBase += increment + '|';

  hbase.getScan({
    table    : 'agg_metrics',
    startRow : keyBase + utils.formatTime(result.start),
    stopRow  : keyBase + utils.formatTime(result.end),
    descending : false
  }, function (err, rows) {

    if (params.exchange && rows.length) {
      var options = {
        base     : {currency:'XRP'},
        counter  : params.exchange,
        start    : moment.utc(result.start).startOf(increment),
        end      : moment.utc(result.end).add(1, increment),
        interval : increment
      };

      getRates(options, function(err, rates) {
        if (err) {
          return callback ("unable to determine exchange rate");
        }

        handleResponse(rows, rates);
      });
    } else {
      handleResponse(rows);
    }
  });


  /*
   * get XRP to specified currency conversion
   *
   */
  function getRates (params, callback) {

    hbase.getExchanges( {
      base     : params.base,
      counter  : params.counter,
      start    : params.start,
      end      : params.end,
      interval : params.interval === 'week' ? '7day' : '1' + params.interval

    }, function(err, resp) {

      if (err) {
        callback(error);
        return;
      }

      var rates = { };
      resp.forEach(function(row){
        rates[row.start] = row.vwap;
      });

      callback(null, rates);
    });
  }

  var handleResponse = function (rows, rates) {

    rows.forEach(function(row, i) {
      row.components   = JSON.parse(row.components);
      row.exchange     = JSON.parse(row.exchange);
      row.total        = parseFloat(row.total || 0);
      row.count        = parseFloat(row.count || 0);
      row.exchangeRate = parseFloat(row.exchangeRate || 0);

      if (rates) {
        row.exchangeRate = rates[row.startTime || row.time] || 0;
        row.exchange = params.exchange;
        row.total *= row.exchangeRate;

        row.components.forEach(function(c, j) {
          c.rate *= row.exchangeRate;
          c.convertedAmount *= row.exchangeRate;
          row.components[j] = c;
        });
      }
    });

    callback(null, rows);
  }
}

module.exports = getMetric;
