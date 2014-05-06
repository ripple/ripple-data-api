var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  async     = require('async'),
  tools     = require('../utils');

/*
 * marketTraders
 * Returns a list of accounts that participated in trading the specified currency
 * pair during the specified time period, ordered by base currency volume.
 * If no trading pair is provided, the API uses a list of the top XRP markets
 * 
 * 
 * base (JSON, optional) ... base currency-issuer. If not present, top XRP markets are queried
 * counter  (JSON, optional) ... counter currency-issuer. Required if base is present
 * period (string, optional) ... Any of the following ("24h", "3d", "7d")
 * startTime (string, optional) ... moment.js readable date string
 * transactions (boolean, optional) ... include individual transactions in the response, defaults to false
 * format ('json' or 'csv', optional) ... defaults to a CSV-like array
 
  curl -H "Content-Type: application/json" -X POST -d '{
    "base"    : {"currency": "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "counter" : {"currency": "BTC", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "period" : "7d"
    
  }' http://localhost:5993/api/marketTraders 

  curl -o marketTraders.csv -H "Content-Type: application/json" -X POST -d '{
    "period"  : "30d",
    "format"  : "csv"
     
  }' http://localhost:5993/api/marketTraders 

  curl -H "Content-Type: application/json" -X POST -d '{
    "period"  : "24h",
    "format"  : "json"
     
  }' http://localhost:5993/api/marketTraders 
  

      
 */

function marketTraders (params, callback) {

  var list     = [], 
    accounts   = {},
    currencies = [],
    base       = params.base,
    counter    = params.counter,
    period     = params.period || "24hr",
    startTime  = moment.utc(params.startTime),
    endTime    = params.startTime ? moment.utc(params.startTime) : moment.utc();
   
  if (!startTime.isValid()) return callback('invalid start time');
  
  if (base && counter) {
    if (typeof base != 'object')               return callback('invalid base currency');
    else if (!base.currency)                   return callback('base currency is required');
    else if (typeof base.currency != 'string') return callback('invalid base currency');
    else if (base.currency.toUpperCase() != "XRP" && !base.issuer)
      return callback('base issuer is required');
    else if (base.currency == "XRP" && base.issuer)
      return callback('XRP cannot have an issuer');
      
    if (typeof counter != 'object')               return callback('invalid counter currency');
    else if (!counter.currency)                   return callback('counter currency is required');
    else if (typeof counter.currency != 'string') return callback('invalid counter currency');
    else if (counter.currency.toUpperCase() != "XRP" && !counter.issuer)
      return callback('counter issuer is required');
    else if (counter.currency == "XRP" && counter.issuer)
      return callback('XRP cannot have an issuer');     
 
    currencies.push({base:base,counter:counter});
    
  } else if (base) {
    return callback('counter currency is required');   
  } else if (counter) {  
    return callback('base currency is required'); 
    
  //use top XRP markets
  } else currencies = [ 
    {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp USD
    {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp BTC
    {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap BTC
    {currency: 'BTC', issuer: 'rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX'}, //Dividend Rippler BTC
    {currency: 'BTC', issuer: 'rNPRNzBB92BVpAhhZr4iXDTveCgV5Pofm9'}, //Ripple Israel BTC
    {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap USD
    {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //RippleCN CNY
    {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}, //RippleChina CNY
    {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'}  //RippleTradeJapan JPY
  ];

  if (period=="7d")       params.startTime ? endTime.add(7,  "days")  : startTime.subtract(7,  "days");
  else if (period=="3d")  params.startTime ? endTime.add(3,  "days")  : startTime.subtract(3,  "days");
  else if (period=="24h") params.startTime ? endTime.add(24, "hours") : startTime.subtract(24, "hours");
  else                    params.startTime ? endTime.add(24, "hours") : startTime.subtract(24, "hours");
  
 
 // Mimic calling offersExercised for each asset pair
  async.map(currencies, function(c, asyncCallbackPair){

    require("./offersExercised")({
      base      : c.base    || {currency:"XRP"},
      counter   : c.counter || c,
      startTime : startTime,
      endTime   : endTime,
      reduce    : false
      
    }, function(error, data) {
        //console.log(data);
        
        if (error) return asyncCallbackPair(error);
        prepareData(data);
        
        asyncCallbackPair(null);
      
    }, true);

  }, function(error){
    if (error) return callback(error);
    for (var i in accounts) list.push(accounts[i]);
    list.sort(function(a,b){return b.volume-a.volume});
    handleResponse(list);
  }); 
  
  function prepareData (data) {
    
    data.shift(); //remove header row
    data.forEach(function(d){

      if (accounts[d[4]]) {
        accounts[d[4]].sell.baseVolume    += d[2];
        accounts[d[4]].sell.counterVolume += d[3];
        accounts[d[4]].sell.count++
        accounts[d[4]].baseVolume    += d[2];
        accounts[d[4]].counterVolume += d[3];
        accounts[d[4]].count++;
        
      } else {
        accounts[d[4]] = {
          buy           : {baseVolume:0.0,  counterVolume:0.0,  count:0},
          sell          : {baseVolume:d[2], counterVolume:d[3], count:1},
          account       : d[4],
          baseVolume    : d[2],
          counterVolume : d[3],
          count         : 1,
        }
      }
      
      if (accounts[d[5]]) {
        accounts[d[5]].buy.baseVolume    += d[2];
        accounts[d[5]].buy.counterVolume += d[3];
        accounts[d[5]].buy.count++;
        accounts[d[5]].baseVolume    += d[2];
        accounts[d[5]].counterVolume += d[3];
        accounts[d[5]].count++;
        
      } else {
        accounts[d[5]] = {
          buy           : {baseVolume:d[2], counterVolume:d[3], count:1},
          sell          : {baseVolume:0.0,  counterVolume:0.0,  count:0},
          account       : d[5],
          baseVolume    : d[2],
          counterVolume : d[3],
          count         : 1,
        }
      }
      
      if (params.transactions) {
        if (!accounts[d[4]].transactions) accounts[d[4]].transactions = [];
        if (!accounts[d[5]].transactions) accounts[d[5]].transactions = [];
        
        accounts[d[4]].transactions.push(d);
        accounts[d[5]].transactions.push(d);
      }
    });
  }
  
/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (rows) {   
    var response;
    
    if (params.format === 'json') { 
      response = {
        startTime : startTime.format(),
        endTime   : endTime.format(),  
        results   : rows
      };
      
      return callback(null, response);
         
    } else {
      
    
      response = [[
        "account",
        "baseVolume", 
        "counterVolume", 
        "count", 
        "buyBaseVolume", 
        "buyCounterVolume", 
        "buyCount", 
        "sellBaseVolume",
        "sellCounterVolume",
        "sellCount"
      ]];
      
      if (params.transactions && params.format!='csv') response[0].push("transactions");
      
      rows.forEach(function(row) {
        var r = [
          row.account,
          row.baseVolume,
          row.counterVolume,
          row.count,
          row.buy.baseVolume,
          row.buy.counterVolume,
          row.buy.count,
          row.sell.baseVolume,
          row.sell.counterVolume,
          row.sell.count
        ];
        
        if (params.transactions && params.format!='csv') r.push(row.transactions);
        response.push(r);
      }); 
      
      if (params.format === 'csv') {

        var csvStr = _.map(response, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        return callback(null, csvStr);

      } else {
        
        //no format or incorrect format specified
        return callback(null, response); 
      }
    }
  }
}


module.exports = marketTraders;