var winston = require('winston');
var moment  = require('moment');
var ripple  = require('ripple-lib');
var async   = require('async');
var offersExercised = require('./offersExercised');
var networkValue    = require('../library/metrics/networkValue');

/**
 *  totalNetworkValue: 
 * 
 *  total value of currencies for the top gateways on the ripple network, 
 *  normalized to a specific currrency.
 *
 *  request : 
 *
 * {
 *    time : "2014-03-13T20:39:26+00:00"      //time of desired snapshot
 *    exchange  : {                           // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),         
 *      issuer    : "rAusZ...."               // optional, required if currency != XRP
 *    }
 * }
 *
 * response : 
 *
 * {
 *    time     : "2014-03-13T20:39:26+00:00",           //time of desired snapshot
 *    exchange     : {
 *      currency : "USD",                               //exchange currency
 *      issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"  //exchange issuer
 *    },
 *    exchangeRate : 0.014301217579817786,              //exchange rate
 *    total        : 726824.6504823748,                 //total network value in exchange currency
 *    components   : [                                  //list of component currencies
 *      {
 *        currency        : "USD",
 *        issuer          : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
 *        amount          : 27606.296227064257,
 *        rate            : 1,
 *        convertedAmount : 27606.296227064257
 *      },
 *      .
 *      .
 *      .
 *      .
 *    ]
 * }
 * 
 curl -H "Content-Type: application/json" -X POST -d '{
      
    }' http://localhost:5993/api/totalnetworkvalue

 curl -H "Content-Type: application/json" -X POST -d '{
      "exchange" : {"currency": "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}
    }' http://localhost:5993/api/totalnetworkvalue

 curl -H "Content-Type: application/json" -X POST -d '{
      "exchange" : {"currency": "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "time" : "2014-03-13T20:39:26+00:00"
    }' http://localhost:5993/api/totalnetworkvalue        
 * 
 */  
 
function totalNetworkValue(params, callback) {

  var viewOpts = {};
  var ex       = params.exchange || {currency:'XRP'};
  var time     = moment.utc(params.time);
  var cacheKey; 

  if (!time.isValid()) return callback('invalid time: ' + params.time);

  if (typeof ex != 'object') {         
    return callback('invalid exchange currency');
    
  } else if (!ex.currency) {                  
    return callback('exchange currency is required');
    
  } else if (typeof ex.currency != 'string') {
    return callback('invalid exchange currency');
    
  } else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer) {
    return callback('exchange issuer is required');
    
  } else if (ex.currency == "XRP" && ex.issuer) {
    return callback('XRP cannot have an issuer');
  }
    
  //live request  
  if (time.diff(moment.utc()) >= -30000) {

    if (!CACHE) {
      return callback('metric unavailable at this time');
    }
    
    redis.get('TNV:XRP:live', function(error, response){
      if (error) {                     
        callback("Redis - " + error);
        
      } else if (!response) {   
        callback('metric unavailable at this time');
      
      } else if (ex.currency === 'XRP') {
        callback(null, JSON.parse(response));  
        
      } else {
        convert(ex, JSON.parse(response), callback);
      }
    });
    
    return;
  }
  
  if (CACHE) {
    cacheKey = "TNV:" + ex.currency;
    if (ex.issuer) cacheKey += "."+ex.issuer;
    cacheKey += ":hist:"+time.unix();
    
    redis.get(cacheKey, function(error, response){
      if (error)         return callback("Redis - " + error);
      else if (response) return callback(null, JSON.parse(response));  
      else networkValue({time:time, ex:ex}, callback);
    });
    
  } else networkValue({time:time, ex:ex}, callback);
}
/*  
  //prepare results to send back
  var response = {
    time     : time.format(),
    exchange : ex,  
  };
  
  if (CACHE) {
    cacheKey = "TNV:" + ex.currency;
    if (ex.issuer) cacheKey += "."+ex.issuer;
    if (time.unix()==moment.utc().unix()) { //live update request
      cacheKey += ":live";

    } else {
      cacheKey += ":hist:"+time.unix();
    }
    
    redis.get(cacheKey, function(error, response){
      if (error)                      return callback("Redis - " + error);
      if (response && params.history) return callback(null, true);
      else if (response)              return callback(null, JSON.parse(response));  
      else fromCouch();
    });
    
  } else fromCouch();
  
  function fromCouch() {
    
    // Mimic calling issuerCapitalization for the currencies
    require("./issuerCapitalization")({
        currencies : currencies,
        startTime  : moment.utc(0),
        endTime    : moment.utc(),
      
    }, function(error, data) {

      if (error) return callback(error);
      currencies = data; //replace currencies with the response
      
      getExchangeRates(time, conversionPairs, function(error, rates){
        if (error) return callback(error);
        
        var finalRate = ex.currency == "XRP" ? 1 : null;
        
        rates.forEach(function(pair, index){
          currencies[index].rate            = pair.rate; 
          currencies[index].convertedAmount = pair.rate ? currencies[index].amount / pair.rate : 0;
        
          //check to see if the pair happens to be the
          //final conversion currency we are looking for
          if (pair.counter.currency == ex.currency &&
              pair.counter.issuer   == ex.issuer) finalRate = pair.rate;
        });
        
        getXRPbalance(function(error, balance){
          if (error) return callback(error);
          
          currencies.push({
            currency : "XRP",
            amount   : balance
          })
          
          
          if (finalRate) finalize();
          else {
            getConversion({
              startTime : startTime,
              endTime   : endTime,
              currency  : ex.currency,
              issuer    : ex.issuer
            }, function(error, rate){
              if (error) return callback(error);
              finalRate = rate;
              finalize(); 
            });
          }
        });
        
        
        function finalize () {
          var total = 0, count = 0;
          currencies.forEach(function(currency, index) {
  
            if (currency.currency == "XRP") {
              currency.rate            = 1; //for XRP
              currency.convertedAmount = currency.amount;
            }
            
            currency.convertedAmount *= finalRate;
            currency.rate = finalRate / currency.rate;
            total += currency.convertedAmount;
          });
        
          response.exchangeRate = finalRate;
          response.total        = total;
          response.components   = currencies;
           
          if (CACHE) {
            cacheResponse (cacheKey, response);
          }
          
          if (params.history) callback(null, false);
          else callback(null, response);         
        }
                
      });      
     
    });
  }
  
*/
  
  
  
/*
 * get XRP to specified currency conversion
 */
  
function convert (ex, data, callback) {

  // Mimic calling offersExercised 
  offersExercised({
    base      : {currency:"XRP"},
    counter   : ex,
    startTime : moment.utc().subtract(24, 'hours'),
    endTime   : moment.utc(),
    timeIncrement : 'all'

  }, function(err, resp) {
    var rate;

    if (err) {
      callback(err);
      
    } else if (!resp || !resp.length || resp.length<2) {
      callback("cannot determine exchange rate");
      
    } else {
      rate = resp[1][8]; // vwavPrice 
      
      data.components.forEach(function(currency, index) {

        currency.convertedAmount *= rate;
        currency.rate            *= rate;
      });

      data.exchange     = ex;
      data.exchangeRate = rate;
      data.total       *= rate;
      callback(null, data);       
    }
  });    
}
  
module.exports = totalNetworkValue;