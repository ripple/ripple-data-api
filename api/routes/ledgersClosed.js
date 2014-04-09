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
 *  startTime     : (any momentjs-readable date), // optional
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
    "endTime"   : "Apr 10, 2014 10:00 am"
    
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

   
function ledgersClosed( req, res ) {
  
  var viewOpts = {};
  
  //Parse start and end times
  var range = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);
  
  if (range.error) return res.send(500, { error: range.error });  
  if (!range.start) range.start = moment.utc(0);
  if (!range.end)   range.end   = moment.utc();
  
  // set startkey and endkey for couchdb query
  viewOpts.startkey = range.start.toArray().slice(0,6);
  viewOpts.endkey   = range.end.toArray().slice(0,6);
  
  if (req.body.descending) viewOpts.descending = true;
  
  //parse time increment and time multiple
  var results = tools.parseTimeIncrement(req.body.timeIncrement);  

  //set reduce option only if its false
  if (results.group_level)   viewOpts.group_level = results.group_level + 1;
   else if (req.body.reduce === false) viewOpts.reduce = false;
 
  if (viewOpts.reduce===false) {
    if (req.body.limit  && !isNaN(req.body.limit))  viewOpts.limit = parseInt(req.body.limit, 10);
    if (req.body.offset && !isNaN(req.body.offset)) viewOpts.skip  = parseInt(req.body.offset, 10);
  } 
  
  viewOpts.stale = "ok"; //dont wait for updates 
  
  db.view('ledgersClosed', 'v1', viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }
    
    handleResponse(couchRes.rows);
  });
  
  function handleResponse (rows) {
    
    if (req.body.format === 'json') {
      
      var apiRes = {};
      apiRes.startTime     = range.start.format();
      apiRes.endTime       = range.end.format();
      apiRes.timeIncrement = req.body.timeIncrement;
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
            
      } else if (req.body.timeIncrement) {
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
      
      res.json(apiRes);
    
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
        
      } else if (req.body.timeIncrement) {
        data.push(["time","count"]);
        for (var j=0; j<rows.length; j++) {
          data.push([
            moment.utc(rows[j].key).format() ,
            rows[j].value
          ]);
        }
        
      } else res.send(rows[0] ? rows[0].value.toString() : 0);
      
  
      if (req.body.format === 'csv') {

        var csvStr = _.map(data, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        res.end(csvStr);


      } else {
        //no format or incorrect format specified
        res.send(data);      
      } 
    }  
  } 
}

module.exports = ledgersClosed;
