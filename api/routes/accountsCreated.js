'use strict';

var moment = require('moment');
var _ = require('lodash');
var tools = require('../utils');


/**
 *  accountsCreated returns the number of accounts created per time increment
 *
 *  max returned results : 500;
 *
 *  expects params to have:
 *  {
 *    startTime: (any momentjs-readable date), // optional, defaults to 30 days before endTime
 *    endTime: (any momentjs-readable date), // optional, defaults to now
 *    timeIncrement : (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    descending: true/false, // optional, defaults to true
 *    reduce: true/false  // optional, defaults to false, ignored if timeIncrement is set. false returns individual transactions
 *    limit: limit the number of responses, ignored if time increment is set or reduce is true
 *    offset: offset by n transactions for pagination
 *    format: 'json', 'csv'
 *  }
 *
    curl  -H "Content-Type: application/json" -X POST -d '{
      "reduce" : false,
      "format" : "json",
      "limit"  : 2

    }' http://localhost:5993/api/accountsCreated

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Dec 30, 2012 10:00 am",
      "endTime"   : "Jan 30, 2014 10:00 am",
      "timeIncrement": "day"

    }' http://localhost:5993/api/accountsCreated

  curl -o accounts.csv -H "Content-Type: application/json" -X POST -d '{
      "reduce"    : false,
      "format"    : "csv"

    }' http://localhost:5993/api/accountsCreated

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Mar 9, 2014 10:00 am",
      "endTime"   : "Mar 10, 2014 10:00 am",
      "reduce" : false,
      "format"    : "json",
      "limit" :20

    }' http://localhost:5993/api/accountsCreated

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Mar 9, 2014 10:00 am",
      "endTime"   : "Mar 10, 2014 10:00 am",
      "descending" : true,
      "reduce" : false,
      "limit"  : 20,
      "offset" : 20,
      "format" : "csv"


    }' http://localhost:5993/api/accountsCreated

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Mar 9, 2014 10:00 am",
      "endTime"   : "Mar 10, 2014 10:00 am",
      "format"    : "json"

    }' http://localhost:5993/api/accountsCreated
 */


function accountsCreated(params, callback) {

  var viewOpts = {};
  var limit = params.limit  ? parseInt(params.limit, 10)  : 0;
  var maxLimit = 500;
  var intervals = ['hour', 'day', 'week'];

  if (!limit || limit > maxLimit) limit = maxLimit;

  if (params.offset) {
    callback('offset is no longer supported. use marker instead');
    return;
  }

  //Parse start and end times
  var range = tools.parseTimeRange(params.startTime, params.endTime, params.descending);

  if (range.error) return callback(range.error);
  if (!range.end)   range.end   = moment.utc();
  if (!range.start) range.start = moment.utc(range.end).subtract(30, "days");

  if (params.timeIncrement === 'all') {
    params.reduce = true;
  } else if (params.timeIncrement) {
    params.timeIncrement = params.timeIncrement.toLowerCase();
    if (intervals.indexOf(params.timeIncrement) === -1) {
      callback('invalid time increment - use: ' + intervals.join(', '));
      return;
    }
  }

  var options = {
    descending: (/false/i).test(params.descending) ? false : true,
    reduce: (/true/i).test(params.reduce) ? true : false,
    limit: limit || 500,
    start: range.start,
    end: range.end,
    interval: params.timeIncrement === 'all' ? undefined : params.timeIncrement
  };

  hbase.getAccounts(options, function(err, resp) {
    handleResponse(resp || {});
  });

  /**
   * handleResponse - format the data according to the requirements
   * of the request and return it to the caller.
   *
   */
  function handleResponse (resp) {
    var rows = resp.rows || [];

    if (params.format === 'json') {
      var response = {
        startTime      : range.start.format(),
        endTime        : range.end.format(),
        timeIncrement  : params.timeIncrement,
        marker         : resp.marker,
        total          : 0
      }

      // aggregated rows
      if (params.timeIncrement) {

        response.results = [];
        rows.forEach(function(row){
          response.total += row.count;
          response.results.push({
            time  : row.date,
            count : row.count
          });
        });

      // individual rows
      } else if (!params.reduce) {
        response.total   = rows ? rows.length : 0;
        response.results = [];
        rows.forEach(function(row){
          response.results.push({
            time        : row.executed_time,
            account     : row.account,
            txHash      : row.tx_hash,
            ledgerIndex : row.ledger_index
          });
        });

      // count only
      } else {
        response.total = rows && rows[0] ? rows[0] : 0;
      }

      callback(null, response);

    } else {
      var data = [];

      // aggregated rows
      if (params.timeIncrement) {
        data.push(['time', 'count']);
        rows.forEach(function(row) {
          data.push([
            row.date || range.start.format(),
            row.count || row
          ]);
        });

      // individual rows
      } else if (!params.reduce) {
        data.push(['time', 'account', 'txHash', 'ledgerIndex']);
        rows.forEach(function(row) {
          data.push([
            row.executed_time,
            row.account,
            row.tx_hash,
            row.ledger_index
          ]);
        });

      // count only
      } else {
        callback(null, rows && rows[0] ? rows[0] : 0);
        return;
      }

      if (params.format === 'csv') {

        var csvStr = _.map(data, function(row){
          return row.join(', ');
        }).join('\n');

        // provide output as CSV
        return callback(null, csvStr);


      } else {
        //no format or incorrect format specified
        return callback(null, data);
      }
    }
  }
}

module.exports = accountsCreated;
