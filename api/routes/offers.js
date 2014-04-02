var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  tools     = require('../utils');

/*
 * 
 * 
   curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "trade" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Feb 10, 2014 4:44:00 am",
    "endTime"   : "Apr 16, 2014 5:09:00 am",
    "timeIncrement" : "hour"
      
    }' http://localhost:5993/api/offers

   curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "trade" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Feb 10, 2014 4:44:00 am",
    "endTime"   : "Apr 16, 2014 5:09:00 am",
    "reduce"    : false
      
    }' http://localhost:5993/api/offers 
 * 
 */
function offers ( req, res ) {
  var options  = {};
  options.view = {};
  parseOptions(); //parse request params for query options
  
  if (options.error) {
    winston.error(options.error);
    res.send(500, { error: options.error });
    return;
  }  
  
  db.view("offers", "v1", options.view, function (err, couchRes){
    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }
    
    var header, rows = [];
    if (options.view.reduce !== false) header = ["time", "OfferCreate", "OfferCancel"];
    else header = ["type", "account",'baseAmount','tradeAmount','price','time','txHash','ledgerIndex'];
   
    
    rows.push(header);
    couchRes.rows.forEach(function(row){
      var value = row.value;
      
      if (options.view.reduce === false) {
        value[5] = moment.utc(value[5]).format();
        value.push(row.id);
      } else {
        var time  = row.key ? moment.utc(row.key.slice(1)) : options.startTime;
        value.unshift(time.format());        
      }

      rows.push(value);
    });   
    
    var response = {
      base      : options.base,
      trade     : options.trade,
      startTime : options.startTime.format(),
      endTime   : options.endTime.format(),  
      results   : rows,
    };
    
    if (req.body.timeIncrement) response.timeIncrement = req.body.timeIncrement;
    res.send(response);
  });
  
  function parseOptions() {
     if (!req.body.base || !req.body.trade) {
      options.error = 'please specify base and trade currencies';
      return;
    }
  
    // parse base currency details
    var base, trade;
    
    if (!req.body.base.currency) {
        options.error = 'please specify a base currency';
        return;
      
    } else if (!req.body.base.issuer) {
      
      if (req.body.base.currency.toUpperCase() === 'XRP') {
        options.base = 'XRP';
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
      
    } else if (req.body.base.issuer && ripple.UInt160.is_valid(req.body.base.issuer)) {
      options.base = req.body.base.currency.toUpperCase()+"."+req.body.base.issuer;
      
    } else {
      var baseGatewayAddress = gatewayNameToAddress(req.body.base.issuer, req.body.base.currency.toUpperCase());
      if (baseGatewayAddress) {
        options.base = req.body.base.currency.toUpperCase()+"."+baseGatewayAddress;
        
      } else {
        options.error = 'invalid base currency issuer: ' + req.body.base.issuer;
        return;
      }
    }
  
    // parse trade currency details
    if (!req.body.base.currency) {
      options.error = 'please specify a base currency';
      return;
      
    } else if (!req.body.trade.issuer) {
      if (req.body.trade.currency.toUpperCase()  === 'XRP') {
        options.trade = 'XRP';
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
    } else if (req.body.trade.issuer && ripple.UInt160.is_valid(req.body.trade.issuer)) {
      options.trade = req.body.trade.currency.toUpperCase()+"."+req.body.trade.issuer;
      
    } else {
      var tradeGatewayAddress = gatewayNameToAddress(req.body.trade.issuer, req.body.trade.currency.toUpperCase());
      if (tradeGatewayAddress) {
        options.trade = req.body.trade.currency.toUpperCase()+"."+tradeGatewayAddress;
        
      } else {
        options.error = 'invalid trade currency issuer: ' + req.body.trade.issuer;
        return;
      }
    }
    
  
    //Parse start and end times
    var time = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);
    
    if (time.error) {
      options.error = time.error;
      return;
    }
    
    if (!time.start || !time.end) {
      options.error = "startTime and endTime are required.";
    }
    
    options.startTime = time.start;
    options.endTime   = time.end;  
    
    
    //parse time increment and time multiple
    var results = tools.parseTimeIncrement(req.body.timeIncrement);  
    options.multiple = results.group_multiple;

        //set reduce option only if its false
    if (results.group_level)            options.view.group_level = results.group_level + 2;
    else if (req.body.reduce === false) options.view.reduce      = false;
  
    
    if (req.body.limit && typeof req.body.limit == "number") {
      options.view.limit = req.body.limit;
    }

    // set startkey and endkey for couchdb query
    options.view.startkey   = [options.trade+":"+options.base].concat(options.startTime.toArray().slice(0,6));
    options.view.endkey     = [options.trade+":"+options.base].concat(options.endTime.toArray().slice(0,6));
    options.view.descending = req.body.descending || false; 
  }
} 


module.exports = offers;