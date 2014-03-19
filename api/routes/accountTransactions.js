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
 *    timeIncrement: (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    descending: true/false, // optional, defaults to false
 *    format: 'json', 'csv'
 *  }
 * 

 curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "jan 1, 2014 10:00 am",
      "endTime"   : "jan 10, 2015 10:00 am",
      "account"   : "r2hrqyjdLCBSkB6ADLpWkWtYFK96w1xMn"
      
    }' http://localhost:5993/api/accountTransactions

 
 
 
 function(keys, values, rereduce) {
  if (rereduce) {
    
    var stats = ;
    
    values.forEach( function( value, index ) {
      for (currency in value) {
        
        if (!stats[currency]) stats[currency] = {};
        
        if (currency == "XRP") {  
          for (type in value.XRP) {
            if (!stats.XRP[type]) stats.XRP[type] = {amount:0, count:0};
            stats.XRP[type]['amount'] += value.XRP[type]['amount'];
            stats.XRP[type]['count']  += value.XRP[type]['count'];
          }
        } else {
          for (issuer in value[currency]) {
            if (!stats[currency][issuer]) stats[currency][issuer] = {};
            
            for (type in value[currency][issuer]) {
              if (!stats[currency][issuer][type]) stats[currency][issuer][type] = {amount:0, count:0};
              stats[currency][issuer][type]['amount'] += value[currency][issuer][type]['amount'];
              stats[currency][issuer][type]['count']  += value[currency][issuer][type]['count'];
            }          
          }
        }
      }
    });
    
    return stats;
    
  } else {
    var stats = {};


    values.forEach( function( value, index ) {

      //value[0] = currency
      //value[1] = issuer
      //value[2] = sent or recieved
      //value[3] = amount
      
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
      
    });
    
    return stats;   
    
  }
}
 
 
 
 
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

  //set reduce option only if its false
  if (results.group_level)            viewOpts.group_level = results.group_level + 1;
  else if (req.body.reduce === false) viewOpts.reduce      = false;
  
  viewOpts.stale = "ok"; //dont wait for updates
  
  console.log(viewOpts);
  
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