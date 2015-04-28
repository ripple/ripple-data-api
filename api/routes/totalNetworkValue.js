var winston = require('winston');
var moment  = require('moment');
var ripple  = require('ripple-lib');
var async   = require('async');
var networkValue = require('../library/metrics/networkValue');
var utils   = require('../library/utils');

/**
 *  totalNetworkValue:
 *
 *  total value of currencies for the top gateways on the ripple network,
 *  normalized to a specific currrency.
 *
 *  request :
 *
 * {
 *    time : "2014-03-13T20:39:26+00:00"      //time of desired snapshot
 *    exchange  : {                           // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),
 *      issuer    : "rAusZ...."               // optional, required if currency != XRP
 *    }
 * }
 *
 * response :
 *
 * {
 *    time     : "2014-03-13T20:39:26+00:00",           //time of desired snapshot
 *    exchange     : {
 *      currency : "USD",                               //exchange currency
 *      issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"  //exchange issuer
 *    },
 *    exchangeRate : 0.014301217579817786,              //exchange rate
 *    total        : 726824.6504823748,                 //total network value in exchange currency
 *    components   : [                                  //list of component currencies
 *      {
 *        currency        : "USD",
 *        issuer          : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
 *        amount          : 27606.296227064257,
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
 curl -H "Content-Type: application/json" -X POST -d '{

    }' http://localhost:5993/api/totalnetworkvalue

 curl -H "Content-Type: application/json" -X POST -d '{
      "exchange" : {"currency": "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}
    }' http://localhost:5993/api/totalnetworkvalue

 curl -H "Content-Type: application/json" -X POST -d '{
      "exchange" : {"currency": "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "time" : "2014-03-13T20:39:26+00:00"
    }' http://localhost:5993/api/totalnetworkvalue
 *
 */

function totalNetworkValue(params, callback) {

  var viewOpts = {};
  var ex       = params.exchange || {currency:'XRP'};
  var time     = moment.utc(params.time);
  var cacheKey;

  if (!time.isValid()) return callback('invalid time: ' + params.time);

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

  rowkey = 'network_value';

  if (!params.time) {
    rowkey += '|live';

  } else {
    time.startOf('day');
    rowkey += '|' + utils.formatTime(time);
  }

  hbase.getRow({
    table: 'agg_metrics',
    rowkey: rowkey
  }, function(err, row) {

    var options = {
      end      : moment.utc(time),
      ex       : ex
    };

    if (row) {
      row.components   = JSON.parse(row.components);
      row.exchange     = JSON.parse(row.exchange);
      row.total        = parseFloat(row.total);
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
/*
    //check for final rate within row first
    for(var i=0; i<row.components.length; i++) {
      if (row.components[i].currency === options.ex.currency &&
          row.components[i].issuer   === options.ex.issuer) {

        //normalize and return
        normalize(row.components[i].rate, row, callback);
        return;
      }
    }
*/

    utils.getConversion({
      currency : options.ex.currency,
      issuer   : options.ex.issuer,
      start    : moment.utc(options.end).subtract(1, 'day'),
      end      : options.end,
      interval : '1day'
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

module.exports = totalNetworkValue;
