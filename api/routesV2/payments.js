'use strict';
var moment = require('moment');

module.exports = function(params, callback) {
  var intervals = ['hour', 'day', 'week', 'month'];
  var options = {
    currency: params.currency ?
      params.currency.toUpperCase() : undefined,
    issuer: params.issuer,
    interval: params.timeIncrement ?
      params.timeIncrement.toLowerCase() : undefined,
    end: moment.utc(params.endTime),
    start: moment.utc(params.startTime || 0),
    limit: params.limit || 200,
    marker: params.marker,
    descending: false
  };

  if (!options.currency) {
    callback('currency is required');
    return;
  } else if (options.currency !== 'XRP' && !options.issuer) {
    callback('issuer is required');
    return;
  } else if (options.interval && intervals.indexOf(options.interval) === -1) {
    callback('invalid interval - use: ' + intervals.join(', '));
    return;
  }

  if (options.limit > 1000) {
    options.limit = 1000;
  }

  hbase.getPayments(options, function(err, resp) {
    var results = [];

    if (err) {
      callback(err);
      return;
    }

    if (options.interval) {
      results.push(['date','amount','count','average']);
      resp.rows.forEach(function(row) {
        results.push([
          row.date,
          row.amount,
          row.count,
          row.average
        ]);
      });

    } else {
      results.push([
        'date',
        'source',
        'destination',
        'amount',
        'ledger_index',
        'tx_hash'
      ]);

      resp.rows.forEach(function(row) {
        results.push([
          moment.unix(row.executed_time).utc().format(),
          row.source,
          row.destination,
          row.amount,
          row.ledger_index,
          row.tx_hash
        ]);
      });

    }

    callback(null, results);
  });
};
