var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
  
/**
 *  accountTransactions returns transactions in which an account sent or received an amount.
 * 
 *  expects req.body to have:
 *  {
 *    account: //ripple address of the account to query
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    timeIncrement: (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    reduce : true/false  // optional, defaults to false, ignored if timeIncrement is set. false returns individual transactions
 *    descending: true/false, // optional, defaults to true
 *    limit  : limit the number of responses, ignored if time increment is set or reduce is true
 *    offset : offset by n transactions for pagination
 *    format : 'json', 'csv'   // optional
 *  }
 * 

 curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "jan 1, 2014 10:00 am",
      "endTime"   : "jan 10, 2015 10:00 am",
      "account"   : "r2hrqyjdLCBSkB6ADLpWkWtYFK96w1xMn"
      
    }' http://localhost:5993/api/accountTransactions
    
 * 
 */

function accountTransactions( req, res ) {

  var viewOpts = {};

  if (!req.body.account) return res.send(500, { error: "please provide a valid ripple account"});
  var account = req.body.account; 
  
  //Parse start and end times
  var range = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);
  
  if (range.error)  return res.send(500, { error: range.error });  
  if (!range.start) range.start = moment.utc(0);
  if (!range.end)   range.end   = moment.utc();
  
  // set startkey and endkey for couchdb query
  viewOpts.startkey = [account].concat(range.start.toArray().slice(0,6));
  viewOpts.endkey   = [account].concat(range.end.toArray().slice(0,6));
  
  if (req.body.descending) viewOpts.descending = true;
  
  //parse time increment and time multiple
  var results = tools.parseTimeIncrement(req.body.timeIncrement);  

  if (results.group_level)   viewOpts.group_level = results.group_level + 1;
  else if (!req.body.reduce) viewOpts.reduce      = false;
  
  if (viewOpts.reduce===false) {
    if (req.body.limit  && !isNaN(req.body.limit))  viewOpts.limit = parseInt(req.body.limit, 10);
    if (req.body.offset && !isNaN(req.body.offset)) viewOpts.skip  = parseInt(req.body.offset, 10);
  }
  
  viewOpts.stale = "ok"; //dont wait for updates
  
  db.view('accountTransactions', 'v1', viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }
    
    var stats = {}, counterparties = {}, transactions = [];

    couchRes.rows.forEach( function( row, index ) {
      var value = row.value;
      
      //value[0] = currency
      //value[1] = issuer
      //value[2] = sent or recieved
      //value[3] = amount
      //value[4] = counterparty
      
      //counterparties[value[4]] = "";
      
      if (value[0]=='XRP') {
        if (!stats[value[0]])           stats[value[0]] = {};
        if (!stats[value[0]][value[2]]) stats[value[0]][value[2]] = {amount:0, count:0};
        stats[value[0]][value[2]]['amount'] += value[3];
        stats[value[0]][value[2]]['count']++;
        
        
      } else {
        if (!stats[value[0]])                     stats[value[0]] = {};
        if (!stats[value[0]][value[1]])           stats[value[0]][value[1]] = {};
        if (!stats[value[0]][value[1]][value[2]]) stats[value[0]][value[1]][value[2]] = {amount:0, count:0};
        stats[value[0]][value[1]][value[2]]['amount'] += value[3];
        stats[value[0]][value[1]][value[2]]['count']++;
      }
      
      transactions.push({
        currency     : value[0],
        issuer       : value[1],
        type         : value[2],
        amount       : value[3],
        counterparty : value[4],
        time         : moment.utc(value[5]).format(),
        tx_hash      : value[6],
        ledgerIndex  : parseInt(row.id, 10),
      });
    });
    
    var response = {
      account        : account,
      startTime      : range.start.format(),
      endTime        : range.end.format(),
      summary        : stats,
      //counterparties : _.keys(counterparties),
      transactions   : transactions
    }
    
    res.send(response);
  });
}


module.exports = accountTransactions;