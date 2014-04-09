var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
  
/**
 *  accountsCreated returns the number of accounts created per time increment
 *  expects req.body to have:
 *  {
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    timeIncrement : (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    descending: true/false, // optional, defaults to true
 *    reduce: true/false  // optional, defaults to false, ignored if timeIncrement is set. false returns individual transactions
 *    limit: limit the number of responses, ignored if time increment is set or reduce is true
 *    offset: offset by n transactions for pagination
 *    format: 'json', 'csv'
 *  }
 * 
    curl -H "Content-Type: application/json" -X POST -d '{
      "reduce" : false
      
    }' http://localhost:5993/api/accountsCreated

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Dec 30, 2012 10:00 am",
      "endTime"   : "Jan 30, 2014 10:00 am",
      "reduce"    : false

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


function accountsCreated( req, res ) {

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
  if (results.group_level)            viewOpts.group_level = results.group_level + 1;
  else if (req.body.reduce === false) viewOpts.reduce      = false;

  if (viewOpts.reduce===false) {
    if (req.body.limit  && !isNaN(req.body.limit))  viewOpts.limit = parseInt(req.body.limit, 10);
    if (req.body.offset && !isNaN(req.body.offset)) viewOpts.skip  = parseInt(req.body.offset, 10);
  }
    
  viewOpts.stale = "ok"; //dont wait for updates
  
  db.view('accountsCreated', 'v1', viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }

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
   
    var genTime      = moment("2013-Jan-01 03:21:10+00:00"); //date of genesis ledger
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
              value : obj.Account
            });
          }
        }
        
        couchRes.rows = genAccounts.concat(couchRes.rows);      
      }      
    } 

//if we are getting intervals, add the genesis accounts to the
//first interval if it is the same date as the genesis ledger 
//NOTE this is not a perfect solution because the data will not be
//correct if the start time is intraday and after the genesis ledger
//close time
    else if (viewOpts.group_level) { 
      
      if (couchRes.rows.length)  {    

        var index = req.body.descending === false ? 0 : couchRes.rows.length-1;
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
    
    if (req.body.format === 'json') { 
      var response = {
        startTime      : range.start.format(),
        endTime        : range.end.format(),
        timeIncrement  : req.body.timeIncrement,
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
              
      } else if (req.body.timeIncrement) {

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
      
      
      res.send(response);
      return;
      
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
        
      } else if (req.body.timeIncrement) {
        data.push(["time","count"]);
        rows.forEach(function(row){
          data.push([
            moment.utc(row.key).format(),
            row.value
          ]);
        });
        
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

module.exports = accountsCreated;