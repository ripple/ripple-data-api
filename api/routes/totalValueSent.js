var winston = require('winston');
var moment  = require('moment');
var ripple  = require('ripple-lib');
var async   = require('async');
var utils   = require('../library/utils');
var transactionVolume = require('../library/metrics/transactionVolume');

var intervals = [
  'day',
  'week',
  'month'
];

/**
 *  totalValueSent:
 *
 *  total of amounts sent or exchanged from any wallet, either through a payment
 *  or an "offerCreate" that exercises another offer, for a curated list of
 *  currency/issuers and XRP, normalized to a specified currency
 *
 *  request :
 *
 * {
 *    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
 *    endTime   : (any momentjs-readable date), // optional, defaults to now
 *    exchange  : {                             // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),
 *      issuer    : "rAusZ...."                 // optional, required if currency != XRP
 *    }
 * }
 *
 * response :
 *
 * {
 *    startTime    : "2014-03-13T20:39:26+00:00",       //period start
 *    endTime      : "2014-03-14T20:39:26+00:00",       //period end
 *    exchange     : {
 *      currency : "USD",                               //exchange currency
 *      issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"  //exchange issuer
 *    },
 *    exchangeRate : 0.014301217579817786,              //exchange rate
 *    total        : 726824.6504823748,                 //total value sent
 *    count        : 6040,                              //number of transactions
 *    components   : [                                  //list of component currencies
 *      {
 *        currency        : "USD",
 *        issuer          : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
 *        amount          : 27606.296227064257,
 *        count           : 51,
 *        rate            : 1,
 *        convertedAmount : 27606.296227064257
 *      },
 *      .
 *      .
 *      .
 *      .
 *    ]
 * }
 *
 *
    curl -H "Content-Type: application/json" -X POST -d '{
    "exchange"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}

    }' http://localhost:5993/api/total_value_sent

    curl -H "Content-Type: application/json" -X POST -d '{
    "exchange"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime"  : "2015-03-20",
    "interval"   : "day"

    }' http://localhost:5993/api/total_value_sent
 */

function totalValueSent(params, callback) {

  var viewOpts = {};
  var ex       = params.exchange || {currency:'XRP'};
  var interval;
  var startTime;
  var rowkey;

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
  rowkey    = 'transaction_volume';

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

  //get the row from hbase
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
    var params;

    if (options.ex.currency === 'XRP') {
      callback(null, row);
      return;
    }

    row.exchange = options.ex;

    //check for final rate within row first
    for(var i=0; i<row.components.length; i++) {
      if (row.components[i].currency === options.ex.currency &&
          row.components[i].issuer   === options.ex.issuer) {

        //normalize and return
        normalize(row.components[i].rate, row, callback);
        return;
      }
    }

    utils.getConversion({
      currency : options.ex.currency,
      issuer   : options.ex.issuer,
      start    : options.start,
      end      : moment.utc(options.start).add(1, options.interval),
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
        c.rate     = c.rate ? rate / c.rate : 0;
        row.total += c.convertedAmount;
      });

      row.exchangeRate = rate;
      callback(null, row);
    }
  }
}

module.exports = totalValueSent;
