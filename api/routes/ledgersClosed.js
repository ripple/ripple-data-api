var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');

/*
 * ledgersClosed:
 *
 *
 * request:
 *
 * {
 *  startTime     : (any momentjs-readable date), // optional, defaults to 30 days before endTime
 *  endTime       : (any momentjs-readable date), // optional, defaults to now
 *  timeIncrement : (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *  descending    : true/false, // optional, defaults to true
 *  reduce        : true/false  // optional, defaults to false, ignored if timeIncrement is set. false returns individual transactions
 *  limit         : limit the number of responses, ignored if time increment is set or reduce is true
 *  offset        : offset by n ledgers for pagination
 *  format        : 'json', 'csv'  // optional
 * }
 *
 *
 * response (default):
 *
 * [
 *  ["time", "count"],
 *  ["2014-03-10T00:00:00+00:00",7654],
 *  ["2014-03-11T00:00:00+00:00",18323],
 *  ...
 *  ...
 *  ...
 * ]
 *
 *
 * response (json):
 *
 * {
    "startTime": "1970-01-01T00:00:00+00:00",
    "endTime": "2014-04-05T17:05:31+00:00",
    "timeIncrement": "day",
    "total": 292022,
    "results": [
      {
        "time": "2014-03-10T00:00:00+00:00",
        "count": 7654
      },
      {
        "time": "2014-03-11T00:00:00+00:00",
        "count": 18323
      },
      ...
      ...
      ...
    ]
  }
 *
 *
 * response (reduce = false):
 *
 * [
 *  ["time", "ledgerIndex"],
 *  ["2014-04-01T18:39:30+00:00",5842321],
 *  ["2014-04-01T18:39:30+00:00",5842322],
 *  ...
 *  ...
 *  ...
 * ]
 *
 *
 *
 *
 *
 *
  curl -H "Content-Type: application/json" -X POST -d '{
    "startTime" : "Apr 1, 2014 10:00 am",
    "endTime"   : "Apr 10, 2014 10:00 am",
    "reduce" : false

  }' http://localhost:5993/api/ledgersClosed

 curl -H "Content-Type: application/json" -X POST -d '{
    "startTime" : "Apr 1, 2014 10:00 am",
    "endTime"   : "Apr 10, 2014 10:00 am",
    "timeIncrement" : "day"

  }' http://localhost:5993/api/ledgersClosed

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime"     : "Apr 1, 2014 10:00 am",
      "endTime"       : "Apr 1, 2014 11:00 am",
      "reduce"        : false,
      "limit"         : 10,
      "descending"    : true,
      "offset"        : 10

  }' http://localhost:5993/api/ledgersClosed

  curl -H "Content-Type: application/json" -X POST -d '{
    "timeIncrement" : "day"

  }' http://localhost:5993/api/ledgersClosed
 *
 */


function ledgersClosed(params, callback) {

  var viewOpts = {},
    limit      = params.limit  ? parseInt(params.limit, 10)  : 0,
    offset     = params.offset ? parseInt(params.offset, 10) : 0,
    maxLimit   = 500,
    intervalCount;

  if (!limit || limit>maxLimit) limit = maxLimit;

  //Parse start and end times
  var range = tools.parseTimeRange(params.startTime, params.endTime, params.descending);

  if (range.error)  return callback(range.error);
  if (!range.end)   range.end   = moment.utc();
  if (!range.start) range.start = moment.utc(range.end).subtract(30, "days");

  // set startkey and endkey for couchdb query
  viewOpts.startkey = range.start.toArray().slice(0,6);
  viewOpts.endkey   = range.end.toArray().slice(0,6);

  if (params.descending) viewOpts.descending = true;

  //parse time increment and time multiple
  var results = tools.parseTimeIncrement(params.timeIncrement);

  //set reduce option only if its false
  if (results.group_level)   viewOpts.group_level = results.group_level + 1;
   else if (params.reduce === false) viewOpts.reduce = false;

  if (viewOpts.reduce===false) {
    if (limit  && !isNaN(limit))  viewOpts.limit = limit;
    if (offset && !isNaN(offset)) viewOpts.skip  = offset;
  }

  if (results.group !== false) {
    intervalCount = tools.countIntervals(range.start, range.end, results.name);
    if (intervalCount>maxLimit) {
      return callback("Please specify a smaller time range or larger interval");
    }
  }

  viewOpts.stale = "ok"; //dont wait for updates


  db.view('ledgersClosed', 'v1', viewOpts, function(error, couchRes){

    if (error) return callback ('CouchDB - ' + error);

    handleResponse(couchRes.rows);
  });

  function handleResponse (rows) {

    if (params.format === 'json') {

      var apiRes = {};
      apiRes.startTime     = range.start.format();
      apiRes.endTime       = range.end.format();
      apiRes.timeIncrement = params.timeIncrement;
      apiRes.total         = 0;

      if (viewOpts.reduce === false) {
        apiRes.total   = rows.length;
        apiRes.results = [];
        rows.forEach(function(row){
          apiRes.results.push({
            time        : moment.utc(row.key).format(),
            ledgerIndex : parseInt(row.id, 10)
          });
        });

      } else if (params.timeIncrement) {
        apiRes.results = [];
        rows.forEach(function(row){
          apiRes.total += row.value;
          apiRes.results.push({
            time  : moment.utc(row.key).format(),
            count : row.value
          });
        });

      } else {
        apiRes.total = rows[0] ? rows[0].value : 0;
      }

      return callback(null, apiRes);

    } else {
            var data = [], keys = {}, nKeys = 0;

      if (viewOpts.reduce === false) {
        data.push(["time","ledgerIndex"]);
        rows.forEach(function(row){
          data.push([
            moment.utc(row.key).format(),
            parseInt(row.id, 10)
          ]);
        });

      } else if (params.timeIncrement) {
        data.push(["time","count"]);
        for (var j=0; j<rows.length; j++) {
          data.push([
            moment.utc(rows[j].key || range.start).format(),
            rows[j].value
          ]);
        }

      } else return callback(null, rows[0] ? rows[0].value.toString() : 0);


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

module.exports = ledgersClosed;
