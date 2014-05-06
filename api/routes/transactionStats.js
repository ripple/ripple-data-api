var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
/*
 * transactionStats:
 * 
 * breakdown of valid transactions by type on the ripple network over time.
 *
 * request:
 *
 *
 * {
 *  startTime     : (any momentjs-readable date), // optional
 *  endTime       : (any momentjs-readable date), // optional, defaults to now
 *  timeIncrement : (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *  descending    : true/false, // optional, defaults to true
 *  reduce        : true/false  // optional, ignored if timeIncrement is set. false returns individual transactions
 *  limit         : // optional, ignored unless reduce is false - limit the number of returned transactions
 *  offset        : // optional, offset results by n transactions
 *  format        : "json" or "csv" //optional, defaults to CSV-like array  
 * }
 * 
 * 
 * response:
 * 
 * {
 *  ["time", "Payment", "OfferCreate", "OfferCancel", "TrustSet", "AccountSet", "SetFee", "SetRegularKey"]
 *  [ "2014-02-28T18:00:00+0000", 502, 244, 102, 83, 12, 2, 5 ],
 *  [ "2014-02-28T17:00:00+0000", 1800, 500, 232, 103, 55, 12, 4 ],
 *  [ "2014-02-28T16:00:00+0000", 6102, 1293, 503, 230, 100, 14, 5 ],
 *    ...
 *    ...
 *    ...
 * }
 *  
 *
 * response (reduce = false):
 * 
 * {
 *  ["time", "type", "account", "txHash", "ledgerIndex"],
 *  ["2014-02-28T18:00:00+0000", "Payment",     "rXaaFst....", "4ABA3B0777E97BDEA924A732A943B169D...."],
 *  ["2014-02-28T17:00:00+0000", "OfferCreate", "rXaaFst....", "4ABA3B0777E97BDEA924A732A943B169D...."],
 *    ...
 *    ...
 *    ...
 * }
 * 
  curl -H "Content-Type: application/json" -X POST -d '{
    "startTime" : "Mar 10, 2014 11:59 am z",
    "endTime"   : "Mar 11, 2014 12:00 am z",
    "reduce" : false,
    "format" : "csv"
      
  }' http://localhost:5993/api/transactionStats
    
  curl -H "Content-Type: application/json" -X POST -d '{
    "format" : "csv",
    "reduce" : false,
    "limit"  : 10,
    "descending" : true
    
  }' http://localhost:5993/api/transactionStats
  
  curl -H "Content-Type: application/json" -X POST -d '{
    "startTime" : "Jan 1, 2014 z",
    "endTime"   : "Jan 1, 2015 z",    
    "timeIncrement" : "month",
    "format" : "csv" 
  }' http://localhost:5993/api/transactionStats
      
         
 * 
 */

function transactionStats(params, callback) {
  
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
  
  db.view('transactionStats', 'v1', viewOpts, function(error, couchRes){
    
    if (error) return callback ('CouchDB - ' + error);  
    
    handleResponse(couchRes.rows);
  });
  
  
/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (rows) {
    
    if (params.format === 'json') {
      
      // send as an array of json objects
      var apiRes = {};
      apiRes.startTime     = range.start.format();
      apiRes.endTime       = range.end.format();
      apiRes.timeIncrement = params.timeIncrement;
      apiRes.results       = [];
    
      if (viewOpts.reduce === false) {
    
        rows.forEach(function(d){
          apiRes.results.push({
            time        : moment.utc(d.value[2]).format(),
            type        : d.value[0],
            account     : d.value[1],
            txHash      : d.value[3],
            ledgerIndex : parseInt(d.id, 10)
          });
        });
      
      } else {
        rows.forEach(function(d){
          d.value.time = d.key ? moment.utc(d.key).format() : range.start.format();
          apiRes.results.push(d.value);  
        });  
      }
            
      return callback(null, apiRes);
      
    } else {
      var data = [], keys = {}, nKeys = 0;
      
      if (viewOpts.reduce === false) {
        data.push(["time","type","account","txHash","ledgerIndex"]);
        
        for (var i=0; i<rows.length; i++) {
          data.push([
            moment.utc(rows[i].value[2]).format(), 
            rows[i].value[0], //type
            rows[i].value[1], //account
            rows[i].value[3], //tx_hash 
            parseInt(rows[i].id, 10) //ledger_index
          ]);
        }
        
      } else {
        
        rows.forEach(function(row){
          for (var key in row.value) {
            if (typeof keys[key] === 'undefined') keys[key] = nKeys++;
          }
        });
        
        rows.forEach(function(row){
          var r = [];
         
          for (var i in keys) {
            r[keys[i]] = row.value[i] || 0;
          }
          
          r.unshift(row.key ? moment.utc(row.key).format() : range.start.format());
          data.push(r);
        });
        
        data.unshift(["time"].concat(_.keys(keys)));
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

module.exports = transactionStats;