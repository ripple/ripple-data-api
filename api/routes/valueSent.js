var winston = require('winston'),
  moment    = require('moment'),
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
 *  timeIncrement : // second, minute, etc
 *  descending    : // true/false - optional, defaults to false
 *  reduce        : // true/false - optional, ignored if timeIncrement set
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
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am"
      
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
      "endTime"   : "Mar 6, 2014 10:00 am"
      
    }' http://localhost:5993/api/valueSent 


 curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "XRP",
      "startTime" : "Mar 4, 2014 5:00 pm",
      "endTime"   : "Mar 7, 2014 5:00 pm",
      "timeIncrement" : "hour"
      
    }' http://localhost:5993/api/valueSent
    
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am"
      
    }' http://localhost:5993/api/valueSent   
    
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "XRP",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am"
      
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
  var length   = results.group_level ? results.group_level + 1 : 6; 
  var viewOpts = {
    startkey : [currency, issuer].concat(startTime.toArray().slice(0,length)),
    endkey   : [currency, issuer].concat(endTime.toArray().slice(0,length))  
  };


 
  //set reduce option only if its false
  if (results.group_level)            viewOpts.group_level = results.group_level + 3;
  else if (req.body.reduce === false) viewOpts.reduce      = false;
  
  
  //Query CouchDB with the determined viewOpts
  db.view('valueSent', 'v1', viewOpts, function(err, result) {
    if (err) return res.send(500, err);
    
    var rows   = []
    var header = ["time","amount"];
    if (viewOpts.reduce === false) header.push("tx_hash");
    else                           header.push("count");
    
    rows.push(header);
    result.rows.forEach(function(row){
      var value = row.value;
      var time  = row.key ? moment.utc(row.key.slice(2)) : startTime;
      value.unshift(time.format());
      rows.push(value);
    });   
    
    var response = {
      currency  : currency,
      issuer    : issuer,
      startTime : startTime.format(),
      endTime   : endTime.format(),  
      results   : rows,
    };
    
    if (req.body.timeIncrement) response.timeIncrement = req.body.timeIncrement;
    res.send(200, response);
  });
}

module.exports = valueSent;