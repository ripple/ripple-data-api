var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
  
/**
 * valueSent - get the amount of value sent from any account for a specific currency over time. 
 * 
 * request: {
 *
 *  currency   : ("XRP", "USD", etc.)     //required
 *  issuer     : ("bitstamp", "rxSza...") //required
 *    
 *  startTime     : // range start date + time
 *  endTime       : // range end date + time
 *  timeIncrement : // second, minute, etc.     - optional, defaluts to "all"
 *  descending    : // true/false               - optional, defaults to false
 *  reduce        : // true/false               - optional, ignored if timeIncrement set
 *  limit         : // optional, ignored unless reduce is false - limit the number of returned transactions
 *  offset        : // optional, offset results by n transactions
 *  format        : "json" or "csv" //optional, defaults to CSV-like array
 * }
 *
 * response: {
 *  
 *  currency : //from request
 *  issuer   : //from request 
 *  results  : [
 *    ["time","amount","count or tx_hash"],  //tx_hash if reduce = false 
 *    [
 *      time,
 *      amount,
 *      count/tx_hash
 *    ],
 *            .
 *            .
 *            .
 *            .
 *    ]
 *  }
 *

  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q",
      "startTime" : "Mar 15, 2014 10:00 am",
      "endTime"   : "Mar 16, 2014 10:00 am",
      "reduce"    : false,
      "limit"     : 10,
      "offset"    : 10,
      "format"    : "csv"
      
    }' http://localhost:5993/api/valueSent
     
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "CNY",
      "issuer"    : "rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am"
      
    }' http://localhost:5993/api/valueSent
 
 curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 4, 2014",
      "endTime"   : "Mar 7, 2014",
      "timeIncrement" : "hour"
      
    }' http://localhost:5993/api/valueSent

 curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "BTC",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am",
      "format"    : "json"
      
    }' http://localhost:5993/api/valueSent 


 curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "XRP",
      "startTime" : "Mar 14, 2014 5:00 pm",
      "endTime"   : "Mar 17, 2014 5:00 pm",
      "format"    : "csv"
      
    }' http://localhost:5993/api/valueSent
    
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am"
      
    }' http://localhost:5993/api/valueSent   
    
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "XRP",
      "startTime" : "Mar 15, 2014 10:00 am",
      "endTime"   : "Mar 16, 2014 10:00 am"
      
    }' http://localhost:5993/api/valueSent       
 */



function valueSent( req, res ) {

  //parse currency and issuer  
  var currency = req.body.currency ? req.body.currency.toUpperCase() : "";
  var issuer   = req.body.issuer   ? req.body.issuer : "";
   
  if (!currency) return res.send(500, "currency is required");
  if (currency != "XRP" && !issuer) return res.send(500, "issuer is required");


    
  //Parse start and end times
  var time = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);

  if (time.error) return res.send(500, { error: time.error });

  if (!time.start || !time.end) {
   return res.send(500, {error:"startTime and endTime are required."});
  }
      
  var startTime = time.start;
  var endTime   = time.end;

  //parse time increment and time multiple
  var results        = tools.parseTimeIncrement(req.body.timeIncrement);  
  var group_multiple = results.group_multiple;
  
  if (typeof req.body.timeMultiple === 'number') {
    group_multiple = group_multiple ? group_multiple*req.body.timeMultiple : req.body.timeMultiple;
  } else {
    group_multiple = 1;
  }  
  
  //set view options    
  var viewOpts = {
    startkey : [currency, issuer].concat(startTime.toArray().slice(0,6)),
    endkey   : [currency, issuer].concat(endTime.toArray().slice(0,6))  
  };


 
  //set reduce option only if its false
  if (results.group_level)            viewOpts.group_level = results.group_level + 3;
  else if (req.body.reduce === false) viewOpts.reduce      = false;
  
  if (viewOpts.reduce===false) {
    if (req.body.limit  && !isNaN(req.body.limit))  viewOpts.limit = parseInt(req.body.limit, 10);
    if (req.body.offset && !isNaN(req.body.offset)) viewOpts.skip  = parseInt(req.body.offset, 10);
  }
  
  viewOpts.stale = "ok"; //dont wait for updates
  
  //Query CouchDB with the determined viewOpts
  db.view('valueSentV2', 'v1', viewOpts, function(err, couchRes) {
    if (err) return res.send(500, err);
    
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
        currency      : currency,
        issuer        : issuer,
        startTime     : startTime.format(),
        endTime       : endTime.format(),  
        timeIncrement : req.body.timeIncrement,
        results       : []
      };
      
      rows.forEach(function(row){
        if (viewOpts.reduce === false) {
          response.results.push({
            time        : moment.utc(row.key.slice(2)).format(),
            amount      : row.value[0],
            account     : row.value[1],
            destination : row.value[2],
            txHash      : row.value[3],
            ledgerIndex : parseInt(row.id, 10) 
          });
      
        } else {
          response.results.push({
            time   : row.key ? moment.utc(row.key.slice(2)).format() : undefined,
            amount : row.value[0],
            count  : row.value[1]
          });         
        } 
      });
      
      res.send(response);
         
    } else {
      
    
      var header = ["time","amount"];
      if (viewOpts.reduce === false) header = header.concat(["account","destination","txHash","ledgerIndex"]);
      else                           header.push("count");
      
      rows.forEach(function(row, index) {
        var value = row.value;
        var time  = row.key ? moment.utc(row.key.slice(2)) : startTime;
        value.unshift(time.format());
        if (row.id) value.push(parseInt(row.id, 10));
        rows[index] = value;
      }); 
      
      rows.unshift(header);  

      
      if (req.body.format === 'csv') {

        var csvStr = _.map(rows, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        res.end(csvStr);

      } else {
        //no format or incorrect format specified
        res.send(rows); 
      }
    }
  }
}

module.exports = valueSent;