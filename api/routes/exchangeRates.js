var moment = require('moment'),
  ripple   = require('ripple-lib'),
  async    = require('async'),
  _        = require('lodash'),
  utils    = require('../utils'),
  request = require('request');


/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, returning both a volume weighted average and last price
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
 *    last    : (boolean) retreive the last traded price only (faster query)  
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

  curl -H "Content-Type: application/json" -X POST -d '{

    "base"    : {"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "counter" : {"currency":"XRP"},
    "last"    : true
 
  }' http://localhost:5993/api/exchangerates
    
 */

function exchangeRates (params, callback) {
  console.log('Starting ER.');
  var list;
  if (params.pairs && Array.isArray(params.pairs)) 
    list = params.pairs;
  else if (params.base && params.counter) 
    list = [{base:params.base,counter:params.counter}];
  else 
    return callback('please specify a list of currency pairs or a base and counter currency');

  if (list.length>50) return callback("Cannot retrieve more than 50 pairs");

  if (params.depth) depth = params.depth;
  //else return callback('please specify a depth');
  else depth = 1;

  async.mapLimit(list, 50, function(pair, asyncCallbackPair){
    console.log('Checking next pair....');
    midpoint_rate(pair, depth, function(er){
      pair.rate = er;
      asyncCallbackPair(null, pair);
    });
    }, function(error, results){
      console.log('Got response.');
      if (error) return callback(error);
      var finalResults = _.filter(results, function(result){ return result.rate !== 0; });
      console.log('Got results:', finalResults);
      return callback (null, finalResults);
  });
}

/* HELPER FUNCTIONS */

function midpoint_rate(pair, depth, mpCallback){
  var results = {};   

  bid = call_builder('bid', depth, pair);
  ask = call_builder('ask', depth, pair);
  
  async.parallel({
      br: function(callback){
        get_offers(bid, 'bid', depth, function(br){
          callback(null, br);
        })
      },
      ar: function(callback){
        get_offers(ask, 'ask', depth, function(ar){
          callback(null, ar);
        })
      }
  },
  function(err, results) {
    console.log('Call success.');
    er = (results.br+results.ar)/2;
    mpCallback(er)
  });
}

//Make api call to rippled to get orderbooks
function get_offers(json, ba, depth, callback){
  console.log('Making call.');
  request.post(
    'http://s1.ripple.com:51234/',
    {json: json},
    function (error, response, body) {
      if (!error) {
          br = weighted_average(body.result.offers, ba, depth);
          callback(br);
      }
      else{
        callback(error);
      }
    }
  );
}

//Find weighted average given offers
function weighted_average(offers, ba, depth){
    console.log('Taking averages.');
    var rates = [];
    var total = 0;
    var waverage = 0;
    for(var index in offers) {
      //Check whether TakerGets and TakerPays are objects or integers
      if (typeof(offers[index].TakerGets)==='object') taker_gets = offers[index].TakerGets.value;
      else taker_gets = offers[index].TakerGets/1000000;
      if (typeof(offers[index].TakerPays)==='object') taker_pays =  offers[index].TakerPays.value;
      else taker_pays =  offers[index].TakerPays/1000000;
      //Bid or Ask
      if (ba === "ask"){
        exchange = taker_gets/taker_pays;
        value = taker_pays;
      }
      else {
        exchange = taker_pays/taker_gets;
        value = taker_gets;
      }
      //Add rate to rates array
      rates.push([exchange,value]);
      //Increase total
      total += parseFloat(value);
    }
    //Calculate weighted average
    for (var i=0; i<rates.length; i++){
      var percent = rates[i][1]/total;
      waverage += rates[i][0]*percent;
    }
    return waverage;
}

//Builds API call based on currencies provided (xrp has no issuer)
function call_builder(ba, depth, pair){
  var currencyPair = parseCurrencyPair(pair);
  if (ba === 'bid'){
    tg = currencyPair.base;
    tp = currencyPair.counter;
  }
  else {
    tg = currencyPair.counter;
    tp = currencyPair.base;
  }
  call = {
    "method": "book_offers",
    "params": 
    [
      {
        "taker_gets": tg,
        "taker_pays": tp,
        //"limit": depth
      }
    ]
  }
  return call
}

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