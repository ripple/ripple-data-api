var moment = require('moment'),
  ripple   = require('ripple-lib'),
  async    = require('async'),
  _        = require('lodash'),
  utils    = require('../utils');

/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, broken down by the given time increment
 *
 *  expects params to have:
 *  {
 *    pairs    : [
 *      {
 *        base    : {currency:"USD","issuer":"bitstamp"},
 *        counter : {currency:"BTC","issuer":"bitstamp"}
 *      },
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
 *        counter : {currency:"XRP"}
 *      }
 *    ]
 *  
 *    base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"}, //required if "pairs" not present, for a single currency pair exchange rate
 *    counter : {currency:"XRP"}, //require if "pairs" not present, for a single currency pair exchange rate
 *    range   : "hour", "day", "week", "month", year",  //time range to average the price over, defaults to "day"
 *  }
 * 
 *  response :
 *  {
 *    pairs : [
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK","name":"rippleCN"},
 *        counter : {currency:"XRP"},
 *        rate    : //volume weighted average price
 *        last    : //last trade price
 *        range   : "hour", "day", "month", year" - from request
 *      },
 * 
 *      ....
 *    ] 
 *  }
 * 
  curl -H "Content-Type: application/json" -X POST -d '{
    "pairs" : [{
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"}
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"}
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"}
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"}
    }] 
  }' http://localhost:5993/api/exchangerates


 */

function exchangeRates (params, callback) {
  var pairs, list = [];
  var endTime = moment.utc();
  var range   = params.range || "day"; 
  
  if (range=="hour")       startTime = moment.utc().subtract("hours", 1);
  else if (range=="day")   startTime = moment.utc().subtract("days", 1);
  else if (range=="week")  startTime = moment.utc().subtract("weeks", 1);
  else if (range=="month") startTime = moment.utc().subtract("months", 1);
  else if (range=="year")  startTime = moment.utc().subtract("years", 1);
  else { 
    
    //invalid range
    return callback('invalid time range'); 
  }
  
  if (params.pairs && Array.isArray(params.pairs)) 
    pairs = params.pairs;
  else if (params.base && params.counter) 
    pairs = [{base:params.base,counter:params.counter}];
  else {
    //pairs or base and counter required
    return callback('please specify a list of currency pairs or a base and counter currency');
  }
  
  pairs.forEach(function(pair){
    var currencyPair = parseCurrencyPair(pair);
    
    if (currencyPair) list.push(currencyPair);
    else { 
      //invalid currency pair
      return callback('invalid currency pair: ' + JSON.stringify(pair));
    }
  });
  
  if (pairs.length>20) return callback("Cannot retrieve more than 20 pairs");
  
//call offersExercised for each asset pair
  async.mapLimit(list, 10, function(pair, asyncCallbackPair){

    require("./offersExercised")({
        base      : pair.base,
        counter   : pair.counter,
        startTime : startTime,
        endTime   : endTime,
        timeIncrement : 'all'

    }, function(error, data) {

        if (error) return asyncCallbackPair(error);

        if (data && data.length > 1) {
          pair.rate = data[1][8]; // volume weighted average price
          pair.last = data[1][7]; // close price
        } else {
          pair.rate = 0;
        }
        asyncCallbackPair(null, pair);
    });

  }, function(error, results){
    if (error) return callback(error);

    var finalResults = _.filter(results, function(result){ return result.rate !== 0; });
    return callback (null, finalResults);
  });
}

/* HELPER FUNCTIONS */

//format valid currency pairs, reject invalid
function parseCurrencyPair (pair) {
  var base, counter;
  
  if (!pair.base|| !pair.counter) return;
  
  base  = parseCurrency(pair.base);
  counter = parseCurrency(pair.counter); 
  
  if (!base || !counter) return;
  return {base:base,counter:counter};
}

//format valid currency-issuer combinations, reject invalid
function parseCurrency (c) {
  var currency,name,issuer;
    
  if (!c.currency) return;
  else {
    currency = c.currency.toUpperCase();
    
    if (currency == "XRP") {
      if (c.issuer) return null;   //XRP should not have an issuer
      return {currency:"XRP"};
    }
    
    else if (currency != "XRP" && !c.issuer) return null;  //IOUs must have an issuer
    else if (ripple.UInt160.is_valid(c.issuer)) {
    
      issuer = c.issuer;
      name   = utils.getGatewayName(issuer);
      
    } else {  
      
      name   = c.issuer;
      issuer = utils.gatewayNameToAddress(name, currency);
      if (!issuer) return null; //invalid issuer name or address
    } 
  } 
  
  return {currency:currency, issuer:issuer, name:name}; 
}



module.exports = exchangeRates;