var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
  
/**
 *  accountsCreated returns the number of accounts created per time increment
 *  expects req.body to have:
 *  {
 *    timeIncrement: (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    descending: true/false, // optional, defaults to true
 *    format: 'json', 'csv', or 'json_verbose'
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
      "reduce" : false

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
  var results        = tools.parseTimeIncrement(req.body.timeIncrement);  

  //set reduce option only if its false
  if (results.group_level)            viewOpts.group_level = results.group_level + 1;
  else if (req.body.reduce === false) viewOpts.reduce      = false;
  
  viewOpts.stale = "ok"; //dont wait for updates
  
  db.view('accountsCreated', 'v1', viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }

    //winston.info('Got ' + couchRes.rows.length + ' rows');
    //winston.info(JSON.stringify(couchRes.rows));

    // prepare results to send back
    var resRows = [],
      headerRow = [
        'time', 
        'accountsCreated'
      ];
      
   resRows.push(headerRow);   

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
    
    couchRes.rows.forEach(function(row){
      resRows.push([
        (row.key ? moment.utc(row.key).format() : ''),
        row.value
        ]);
    });

    // handle format option
    if (!req.body.format || req.body.format === 'json') {

      // TODO include time sent?
      res.send(resRows);

    } else if (req.body.format === 'csv') {

      var csvStr = _.map(resRows, function(row){
        return row.join(', ');
      }).join('\n');

      // TODO make this download instead of display
      res.setHeader('Content-disposition', 'attachment; filename=offersExercised.csv');
      res.setHeader('Content-type', 'text/csv');
      res.charset = 'UTF-8';
      res.end(csvStr);

    } else if (req.body.format === 'json_verbose') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().valueOf();

      apiRes.rows = _.map(couchRes.rows, function(row){

        // reformat rows
        return {
          openTime: (row.key ? moment.utc(row.key.slice(2)).format() : moment.utc(row.value.openTime).format()),
          accountsCreated: row.value
        };

      });

      res.json(apiRes);

    } else {

      winston.error('incorrect format: ' + req.body.format);
      res.send(500, 'Invalid format: '+ req.body.format);
    }

  });

}

module.exports = accountsCreated;