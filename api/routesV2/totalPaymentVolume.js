'use strict';

var moment = require('moment');
var utils = require('../library/utils');
var paymentVolume = require('../library/metrics/paymentVolume');

var intervals = [
  'day',
  'week',
  'month'
];

/**
 *  totalPaymentVolume
 */

function totalPaymentVolume(params, callback) {

  var viewOpts = {};
  var ex = params.exchange || {currency:'XRP'};
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
  rowkey    = 'payment_volume';

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

  // get the row from hbase
  hbase.getRow({
    table: 'agg_metrics',
    rowkey: rowkey
  }, function(err, row) {
    var options = {
      start: moment.utc(startTime),
      interval: interval,
      ex: ex
    };

    if (row) {
      row.components = JSON.parse(row.components);
      row.exchange = JSON.parse(row.exchange);
      row.total = parseFloat(row.total);
      row.count = parseFloat(row.count);
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

module.exports = totalPaymentVolume;
