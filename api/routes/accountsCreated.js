var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');


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
      "format" : "csv",
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
      "format"    : "json"

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

  var viewOpts = {},
    limit      = params.limit  ? parseInt(params.limit, 10)  : 0,
    offset     = params.offset ? parseInt(params.offset, 10) : 0,
    maxLimit   = 500,
    intervalCount;

  if (!limit || limit>maxLimit) limit = maxLimit;

  //Parse start and end times
  var range = tools.parseTimeRange(params.startTime, params.endTime, params.descending);

  if (range.error) return callback(range.error);
  if (!range.end)   range.end   = moment.utc();
  if (!range.start) range.start = moment.utc(range.end).subtract(30, "days");

  // set startkey and endkey for couchdb query
  viewOpts.startkey = range.start.toArray().slice(0,6);
  viewOpts.endkey   = range.end.toArray().slice(0,6);

  if (params.descending) viewOpts.descending = true;

  //parse time increment and time multiple
  var results = tools.parseTimeIncrement(params.timeIncrement);

  //set reduce option only if its false
  if (results.group_level)            viewOpts.group_level = results.group_level + 1;
  else if (params.reduce === false) viewOpts.reduce      = false;

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

  db.view('accountsCreated', 'v1', viewOpts, function(error, couchRes){

    if (error) return callback ('CouchDB - ' + error);

/*

  //get the number of accounts on the genesis ledger -
  //the total is 136, we dont need to check every time -
  //just left this here to see the logic for arriving at 136

  var l     = require('../db/32570_full.json').result.ledger;
  var genAccounts = 0;
  for (var i=0; i<l.accountState.length; i++) {
    var obj =  l.accountState[i];
    if (obj.LedgerEntryType=="AccountRoot") genAccounts++;
  }

  console.log(genAccounts);

*/


/* below is a workaround for the fact that we dont have ledger history
   before ledger #32570 */

    var genTime      = moment('2013-01-01T03:21:10+00:00'); //date of genesis ledger
    var nGenAccounts = 136;

    if (viewOpts.reduce === false) {

      if (range.start.isBefore(genTime) &&
        range.end.isAfter(genTime)) {

        var l = require('../../db/32570_full.json').result.ledger;
        var genAccounts = [];
        for (var i=0; i<l.accountState.length; i++) {
          var obj =  l.accountState[i];

          if (obj.LedgerEntryType=="AccountRoot") {
            genAccounts.push({
              key : genTime.format(),
              value : [obj.Account, null],
              id : 32570
            });
          }
        }

        couchRes.rows = genAccounts.concat(couchRes.rows);
        if (viewOpts.limit || viewOpts.skip) {
          var skip = viewOpts.skip || 0;
          if (viewOpts.limit) couchRes.rows = couchRes.rows.slice(skip, viewOpts.limit+skip);
          else                couchRes.rows = couchRes.rows.slice(skip);
        }
      }
    }

//if we are getting intervals, add the genesis accounts to the
//first interval if it is the same date as the genesis ledger
//NOTE this is not a perfect solution because the data will not be
//correct if the start time is intraday and after the genesis ledger
//close time
    else if (viewOpts.group_level) {

      if (couchRes.rows.length)  {

        var index = params.descending === false ? 0 : couchRes.rows.length-1;
        var time  = moment.utc(couchRes.rows[index].key);

        if (time.format("YYY-MM-DD")==genTime.format("YYY-MM-DD")) {
          couchRes.rows[index].value += nGenAccounts;
        }
      }

//if we are getting a total, add the genesis acounts if
//the time range includes the genesis ledger
    } else {

      if (range.start.isBefore(genTime) &&
        range.end.isAfter(genTime)) {

        if (couchRes.rows.length) couchRes.rows[0].value += nGenAccounts;
        else couchRes.rows.push({key:null,value:nGenAccounts});

        couchRes.rows[0].key = range.start.format();

      } else if (!couchRes.rows.length) {
        couchRes.rows.push({key:range.start.format(),value:0});
      }
    }


    handleResponse(couchRes.rows);
  });

/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 *
 */
  function handleResponse (rows) {

    if (params.format === 'json') {
      var response = {
        startTime      : range.start.format(),
        endTime        : range.end.format(),
        timeIncrement  : params.timeIncrement,
        total          : 0
      }

      if (viewOpts.reduce === false) {
        response.total   = rows ? rows.length : 0;
        response.results = [];
        rows.forEach(function(row){
          response.results.push({
            time        : moment.utc(row.key).format(),
            account     : row.value[0],
            txHash      : row.value[1],
            ledgerIndex : parseInt(row.id, 10)
          });
        });

      } else if (params.timeIncrement) {

        response.results = [];
        rows.forEach(function(row){
          response.total += row.value;
          response.results.push({
            time  : moment.utc(row.key).format(),
            count : row.value
          });
        });

      } else {
        response.total = rows[0] ? rows[0].value : 0;
      }


      return callback (null, response);

    } else {
      var data = [];

      if (viewOpts.reduce === false) {
        data.push(["time","account","txHash","ledgerIndex"]);
        rows.forEach(function(row){
          data.push([
            moment.utc(row.key).format(),
            row.value[0],
            row.value[1],
            parseInt(row.id, 10)
          ]);
        });

      } else if (params.timeIncrement) {
        data.push(["time","count"]);
        rows.forEach(function(row){
          data.push([
            moment.utc(row.key || range.start).format(),
            row.value
          ]);
        });

      } else {
        callback(null, rows[0] ? rows[0].value.toString() : 0);
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
