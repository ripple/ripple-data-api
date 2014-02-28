var moment = require('moment'),
  tools    = require('../utils');

/****
 * 
 * numTransactions
 * 
 * 
 * request: {
 *
 *    interval   : // second, minute, etc
 *    start      : // range start date + time
 *    end        : // range end date + time
 *    descending : // true/false - optional
 *    reduce     : // true/false - optional
 * }
 *
 * response: [
 *    {
 *      time:
 *      Payment     : # payments
 *      OfferCreate : # offers created
 *      OfferCancel : # offers canceled
 *      TrustSet    : # trust lines sets
 *      AccountSet  : # account sets
 *    }
 *  ]
 *
 */

function numTransactions (req, res) {
  
  //Parse start and end times
  var time = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);
  
  if (time.error) res.send(500, { error: time.error });
  
  var startTime = time.start;
  var endTime   = time.end;
  
  //parse time increment
  var results = tools.parseTimeIncrement(req.body.timeIncrement);
  
  var group          = results.group;
  var group_level    = results.group_level;
  
    // Setup CouchDB view options
  var viewOpts = {
      startkey : startTime.toArray().slice(0,6),
      endkey   : endTime.toArray().slice(0,6),
      reduce   : true
  };
    
    if (group) viewOpts.group = group;
    if (group_level) {
      // +3 to account for 1-based indexing in CouchDB and 
      // startkey having the [pair.issuer, pair.currency] first
      viewOpts.group_level = group_level + 1; 
    }

    // Query CouchDB for changes in trustline balances
    db.view('tx', 'transactionStatsByTime', viewOpts, function(err, results){
      if (err) {
        console.log(err);
        res.send(500, err);
        return;
      }
      
      console.log(results);
      res.send(200);
    });
      
   

}


module.exports = numTransactions;
  
  
  
/*
  curl -H "Content-Type: application/json" -X POST -d '{
      "type"      : "payment",
      "startTime" : "Fri, 14 Feb 2014 22:25:16 +0000",
      "endTime"   : "Fri, 13 Feb 2014 22:25:16 +0000",
      "interval"  : "hour"
    
  
    }' http://localhost:5993/api/numTransactions
 * 
 */