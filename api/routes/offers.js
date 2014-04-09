var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  _         = require('lodash'),
  tools     = require('../utils');

/*
 * offers:
 * 
 * Returns all offer creates and cancels over time for a given trading pair.
 * 
 * 
   curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "counter" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Feb 10, 2014 4:44:00 am",
    "endTime"   : "Feb 11, 2014 5:09:00 am",
    "timeIncrement" : "hour",
    "format" : "csv"
    
    }' http://localhost:5993/api/offers
    

   curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "counter" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Feb 10, 2014 4:44:00 am",
    "endTime"   : "Feb 11, 2014 5:09:00 am",
    "timeIncrement" : "hour",
    "format" : "json"
    
    }' http://localhost:5993/api/offers

   curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "counter" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Feb 10, 2014 4:44:00 am",
    "endTime"   : "Apr 16, 2014 5:09:00 am",
    "reduce"    : false,
    "limit"     : 10,
    "offset"    : 10
     
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
        base          : req.body.base,
        counter       : req.body.counter,
        startTime     : options.startTime.format(),
        endTime       : options.endTime.format(),
        timeIncrement : req.body.timeIncrement,
        results       : []
      };
      
      if (req.body.timeIncrement) response.timeIncrement = req.body.timeIncrement;

      rows.forEach(function(row){
      
        if (options.view.reduce === false) {
          response.results.push({
            type          : row.value[0],
            account       : row.value[1],
            baseAmount    : row.value[2],
            counterAmount : row.value[3],
            price         : row.value[4],
            time          : moment.utc(row.value[5]).format(),
            txHash        : row.value[6],
            ledgerIndex   : parseInt(row.id, 10)
          });
          
        } else {
          response.results.push({
            time : row.key ? moment.utc(row.key.slice(1)) : options.startTime,
            OfferCreate : row.value[0],
            OfferCancel : row.value[1],
          });    
        }
      });     
      
      res.send(response);
      
    } else {
      
    
      var header, results = [];
      if (options.view.reduce !== false) header = ["time", "OfferCreate", "OfferCancel"];
      else header = ["type", "account",'baseAmount','counterAmount','price','time','txHash','ledgerIndex'];
   
      console.log(rows);
      results.push(header);
      rows.forEach(function(row){
        var value = row.value;
      
        if (options.view.reduce === false) {
          value[5] = moment.utc(value[5]).format();
          value.push(parseInt(row.id, 10));
          
        } else {
          var time  = row.key ? moment.utc(row.key.slice(1)) : options.startTime;
          value.unshift(time.format());        
        }
  
        results.push(value);
      }); 
      
      if (req.body.format === 'csv') {

        var csvStr = _.map(results, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        res.end(csvStr);
      
      } else res.send(results);
    }
  }
  
  function parseOptions() {
     if (!req.body.base || !req.body.counter) {
      options.error = 'please specify base and counter currencies';
      return;
    }
  
    // parse base currency details
    var base, counter;
    
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
  
    // parse counter currency details
    if (!req.body.base.currency) {
      options.error = 'please specify a base currency';
      return;
      
    } else if (!req.body.counter.issuer) {
      if (req.body.counter.currency.toUpperCase()  === 'XRP') {
        options.counter = 'XRP';
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
    } else if (req.body.counter.issuer && ripple.UInt160.is_valid(req.body.counter.issuer)) {
      options.counter = req.body.counter.currency.toUpperCase()+"."+req.body.counter.issuer;
      
    } else {
      var counterGatewayAddress = gatewayNameToAddress(req.body.counter.issuer, req.body.counter.currency.toUpperCase());
      if (counterGatewayAddress) {
        options.counter = req.body.counter.currency.toUpperCase()+"."+counterGatewayAddress;
        
      } else {
        options.error = 'invalid counter currency issuer: ' + req.body.counter.issuer;
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
  
    if (options.view.reduce===false) {
      if (req.body.limit  && !isNaN(req.body.limit))  options.view.limit = parseInt(req.body.limit, 10);
      if (req.body.offset && !isNaN(req.body.offset)) options.view.skip  = parseInt(req.body.offset, 10);
    } 
        
    if (req.body.limit && typeof req.body.limit == "number") {
      options.view.limit = req.body.limit;
    }

    // set startkey and endkey for couchdb query
    options.view.startkey   = [options.counter+":"+options.base].concat(options.startTime.toArray().slice(0,6));
    options.view.endkey     = [options.counter+":"+options.base].concat(options.endTime.toArray().slice(0,6));
    options.view.descending = req.body.descending || false; 
  }
} 


module.exports = offers;