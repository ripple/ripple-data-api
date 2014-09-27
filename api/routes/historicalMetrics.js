var tools  = require('../utils');
var moment = require('moment');
/*
 
  request parameters:
  
    startTime
    endTime - optional defaults to now
    timeIncrement - day or month, defaults to month
    metric - one of: topMarkets, totalValueSent, totalNetworkValue
    
    
  curl -H "Content-Type: application/json" -X POST -d '{
    "exchange" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}, 
    "startTime" : "june 1, 2014 4:44:00 am",
    "timeIncrement" : "month",
    "metric" : "totalnetworkvalue"
    
    }' http://localhost:5993/api/historicalMetrics
    
  curl -H "Content-Type: application/json" -X POST -d '{
    "exchange" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}, 
    "startTime" : "June 29, 2014 4:44:00 am",
    "endTime"   : "june 30, 2014 4:44:00 am",
    "timeIncrement" : "day",
    "metric" : "totalnetworkvalue"
    
    }' http://localhost:5993/api/historicalMetrics    
    
 * 
 */
var getMetric = function (params, callback) {
    
  var ex        = params.exchange || {currency:"XRP"};  
  var result    = tools.parseTimeRange(params.startTime, params.endTime);
  var keys      = [];
  var increment = (params.timeIncrement || 'month').toLowerCase();
  var start     = moment.utc(result.start).startOf(increment);
  var keyBase;

  if (!CACHE) return callback('this route is not avaliable');  
  if (params.metric) params.metric = params.metric.toLowerCase();
  else return callback('metric parameter is required');
  
  if      (params.metric === 'topmarkets')        keyBase = 'TM:XRP:hist:';
  else if (params.metric === 'totalvaluesent')    keyBase = 'TVS:XRP:hist:';
  else if (params.metric === 'totalnetworkvalue') keyBase = 'TNV:XRP:hist:';
  else return callback("invalid metric");
  
  if (result.error) {
    return callback(options.error); 
  } 
  
  if (typeof ex != 'object')               return callback('invalid exchange currency');
  else if (!ex.currency)                   return callback('exchange currency is required');
  else if (typeof ex.currency != 'string') return callback('invalid exchange currency');
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return callback('exchange issuer is required');
  else if (ex.currency == "XRP" && ex.issuer)
    return callback('XRP cannot have an issuer');
      
  if (increment !== 'day' && increment !== 'month') {
   return callback('invalid time increment: use "day" or "month"');
  }
  
  if (result.end.diff(Date.now())>0) {
    result.end = moment.utc();
  }

  while(result.end.diff(start)>0) {
    var key = keyBase + start.unix();
    start.add(1, increment);
    if (params.metric !== 'totalnetworkvalue') key += ':' + start.unix();
    keys.push(key);
  }
  
  redis.mget(keys, function(err, resp) {
    var rows = [];
    resp.forEach(function(row) {
      if (row) {
        rows.push(row);
      }
      
    });
    
    if (params.exchange && rows.length) {
      var options = {
        base      : {currency:'XRP'},
        counter   : params.exchange,
        start     : moment.utc(result.start).subtract(1, increment).startOf(increment),
        end       : result.end,
        increment : increment
      };
      
      getConversion(options, function(err, rates) {
        if (err) {
          return callback ("unable to determine exchange rate");
        }
        
        handleResponse(rows, rates); 
      });
    } else {
      handleResponse(rows);
    }
  });
  
  
  /*
   * get XRP to specified currency conversion
   * 
   */
  var getConversion = function (params, callback) {
    
    // Mimic calling offersExercised 
    require("./offersExercised")({
      base      : params.base,
      counter   : params.counter,
      startTime : params.start,
      endTime   : params.end,
      timeIncrement : params.increment
      
    }, function(err, data) {
      if (err) {
        return callback (err);
      }
      
      var rates = { };
      data.shift();
      data.forEach(function(row){
        rates[moment.utc(row[0]).format()] = row[8];    
      });
      callback(null, rates);
    });    
  }
  
  var handleResponse = function (rows, rates) {
    
    rows.forEach(function(r, i) {
      var row = JSON.parse(r);
      if (rates) {
        row.exchangeRate = rates[row.startTime || row.time] || 0; //this shouldnt happen but it will make it obvious
        row.exchange = params.exchange;
        row.total *= row.exchangeRate;
        
        row.components.forEach(function(c, j) {
          c.rate *= row.exchangeRate;
          c.convertedAmount *= row.exchangeRate;
          row.components[j] = c;
        });
      }
      
      rows[i] = row;
    }); 
       
    callback(null, rows);
  }  
}



module.exports = getMetric;