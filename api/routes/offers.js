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
    "reduce"    : false

     
    }' http://localhost:5993/api/offers 
 * 
 */
function offers (params, callback) {
  
  var options  = {};
  options.view = {};
  parseOptions(); //parse request params for query options
  
  if (options.error) return callback(options.error);  
  
  db.view("offers", "v1", options.view, function (error, couchRes){
    
    if (error) return callback ('CouchDB - ' + error);
    
    handleResponse(couchRes.rows);
  });

  
/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (rows) {  
    
    if (params.format === 'json') {
      var response = {
        base          : params.base,
        counter       : params.counter,
        startTime     : options.startTime.format(),
        endTime       : options.endTime.format(),
        timeIncrement : params.timeIncrement,
        results       : []
      };
      
      if (params.timeIncrement) response.timeIncrement = params.timeIncrement;

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
      
      return callback(null, response);
      
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
      
      if (params.format === 'csv') {

        var csvStr = _.map(results, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        return callback(null, csvStr);
      
      } else return callback(null, results);
    }
  }
  
  function parseOptions() {
     if (!params.base || !params.counter) {
      options.error = 'please specify base and counter currencies';
      return;
    }
  
    // parse base currency details
    var base, counter;
    
    if (!params.base.currency) {
        options.error = 'please specify a base currency';
        return;
      
    } else if (!params.base.issuer) {
      
      if (params.base.currency.toUpperCase() === 'XRP') {
        options.base = 'XRP';
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
      
    } else if (params.base.issuer && ripple.UInt160.is_valid(params.base.issuer)) {
      options.base = params.base.currency.toUpperCase()+"."+params.base.issuer;
      
    } else {
      var baseGatewayAddress = gatewayNameToAddress(params.base.issuer, params.base.currency.toUpperCase());
      if (baseGatewayAddress) {
        options.base = params.base.currency.toUpperCase()+"."+baseGatewayAddress;
        
      } else {
        options.error = 'invalid base currency issuer: ' + params.base.issuer;
        return;
      }
    }
  
    // parse counter currency details
    if (!params.base.currency) {
      options.error = 'please specify a base currency';
      return;
      
    } else if (!params.counter.issuer) {
      if (params.counter.currency.toUpperCase()  === 'XRP') {
        options.counter = 'XRP';
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
    } else if (params.counter.issuer && ripple.UInt160.is_valid(params.counter.issuer)) {
      options.counter = params.counter.currency.toUpperCase()+"."+params.counter.issuer;
      
    } else {
      var counterGatewayAddress = gatewayNameToAddress(params.counter.issuer, params.counter.currency.toUpperCase());
      if (counterGatewayAddress) {
        options.counter = params.counter.currency.toUpperCase()+"."+counterGatewayAddress;
        
      } else {
        options.error = 'invalid counter currency issuer: ' + params.counter.issuer;
        return;
      }
    }
    
  
    //Parse start and end times
    var time = tools.parseTimeRange(params.startTime, params.endTime, params.descending);
    
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
    var results = tools.parseTimeIncrement(params.timeIncrement);  
    options.multiple = results.group_multiple;

        //set reduce option only if its false
    if (results.group_level)          options.view.group_level = results.group_level + 2;
    else if (params.reduce === false) options.view.reduce      = false;

    var limit  = params.limit  ? parseInt(params.limit, 10)  : 0,
      offset   = params.offset ? parseInt(params.offset, 10) : 0,
      maxLimit = 500,
      intervalCount;
      
    if (!limit || limit>maxLimit) limit = maxLimit;
      
    if (options.view.reduce===false) {
      if (limit  && !isNaN(limit))  options.view.limit = limit;
      if (offset && !isNaN(offset)) options.view.skip  = offset;
    } 
        
    if (results.group !== false) {
      intervalCount = tools.countIntervals(time.start, time.end, results.name);
      if (intervalCount>maxLimit) {
        return callback("Please specify a smaller time range or larger interval");
      }
    }
    
    // set startkey and endkey for couchdb query
    options.view.startkey   = [options.counter+":"+options.base].concat(options.startTime.toArray().slice(0,6));
    options.view.endkey     = [options.counter+":"+options.base].concat(options.endTime.toArray().slice(0,6));
    options.view.descending = params.descending || false; 
  }
} 


module.exports = offers;