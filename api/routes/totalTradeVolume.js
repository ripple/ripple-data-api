var winston     = require('winston');
var moment      = require('moment');
var ripple      = require('ripple-lib');
var async       = require('async');
var tradeVolume = require('../library/metrics/tradeVolume');
var utils       = require('../library/utils');

var intervals = [
  'day',
  'week',
  'month'
];

/**
 *  topMarkets:
 *
 *  the total trading volume for the top markets on the ripple network
 *  for a given time period, normalized USD. Returns data for the last 24 hours
 *  if no arguments are given.
 *
 * request:
 *
 * {
 *    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
 *    endTime   : (any momentjs-readable date), // optional, defaults to now
 *    exchange  : {                             // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),
 *      issuer    : "rAusZ...."                 // optional, required if currency != XRP
 *    }
 *  }
 *
 * response:
 *
 * {
 *    startTime    : '2014-03-13T20:26:24+00:00',   //period start
 *    endTime      : '2014-03-14T20:26:24+00:00',   //period end
 *    exchange     : { currency: 'XRP' },           //requested exchange currency
 *    exchangeRate : 1,                             //XRP exchange rate of requested currency
 *    total        : 1431068.4284775178,            //total volume in requested currency
 *    count        : 627,                           //number of trades
 *    components   : [                              //list of component markets
 *      {
 *        base            : {"currency":"USD","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
 *        counter         : {"currency":"XRP"},
 *        rate            : 69.9309953931345,
 *        count           : 99,
 *        amount          : 3107.9273091242917,
 *        convertedAmount : 217340.45033656774
 *      },
 *      .
 *      .
 *      .
 *    ]
 * }
 *
 *
 *
   curl -H "Content-Type: application/json" -X POST -d '{

    }' http://localhost:5993/api/topMarkets


   curl -H "Content-Type: application/json" -X POST -d '{
    "exchange"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}

    }' http://localhost:5993/api/topMarkets

 */

function topMarkets(params, callback) {

  var viewOpts = {};
  var ex       = params.exchange || {currency:'XRP'};
  var rowkey;
  var startTime;
  var interval;


  if (typeof ex != 'object') {
    return callback('invalid exchange currency');

  } else if (!ex.currency) {
    return callback('exchange currency is required');

  } else if (typeof ex.currency != 'string') {
    return callback('invalid exchange currency');

  } else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer) {
    return callback('exchange issuer is required');

  } else if (ex.currency == "XRP" && ex.issuer) {
    return callback('XRP cannot have an issuer');
  }

  interval  = (params.interval || '').toLowerCase();
  startTime = moment.utc(params.startTime);
  rowkey    = 'trade_volume';

  if (!params.startTime) {
    startTime.subtract(1, 'day');
    rowkey += '|live';

  } else if (!interval || intervals.indexOf(interval) === -1) {
    callback('invalid interval');
    return;

  } else if (!startTime.isValid()) {
    return callback('invalid time: ' + params.startTime);

  } else {
    startTime.startOf(interval === 'week' ? 'isoWeek' : interval);
    rowkey += '|' + interval + '|' + utils.formatTime(startTime);
  }

  hbase.getRow({
    table: 'agg_metrics',
    rowkey: rowkey
  }, function(err, row) {

    var options = {
      start    : moment.utc(startTime),
      interval : interval,
      ex       : ex
    };

    if (row) {
      row.components   = JSON.parse(row.components);
      row.exchange     = JSON.parse(row.exchange);
      row.total        = parseFloat(row.total);
      row.count        = parseFloat(row.count);
      row.exchangeRate = parseFloat(row.exchangeRate);

      handleResponse (options, row, callback);

    } else {
      callback(err, row);
    }
  });


  function handleResponse (options, row, callback) {

    if (options.ex.currency === 'XRP') {
      callback(null, row);
      return;
    }

    row.exchange = options.ex;

    //check for final rate within row first
    for(var i=0; i<row.components.length; i++) {
      if (row.components[i].base.currency === options.ex.currency &&
          row.components[i].base.issuer   === options.ex.issuer) {

        //normalize and return
        normalize(1 / row.components[i].rate, row, callback);
        return;
      }
    }

    utils.getConversion({
      currency : options.ex.currency,
      issuer   : options.ex.issuer,
      start    : options.start,
      end      : moment.utc(options.start).add(1, options.interval || 'day'),
      interval : options.interval
    }, function (err, rate) {
      if (err) {
        return callback(err);
      }

      normalize(rate, row, callback);
    });

    function normalize (rate, row, callback) {
      row.total = 0;
      row.components.forEach(function(c, index) {

        c.convertedAmount *= rate;
        c.rate      = c.rate ? rate / c.rate : 0;
        row.total += c.convertedAmount;
      });

      row.exchangeRate = rate;
      callback(null, row);
    }
  }
}

module.exports = topMarkets;
