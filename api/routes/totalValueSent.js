var winston = require('winston');
var moment  = require('moment');
var ripple  = require('ripple-lib');
var async   = require('async');
var offersExercised   = require('./offersExercised');
var transactionVolume = require('../library/metrics/transactionVolume');
/**
 *  totalValueSent: 
 * 
 *  total of amounts sent or exchanged from any wallet, either through a payment 
 *  or an "offerCreate" that exercises another offer, for a curated list of 
 *  currency/issuers and XRP, normalized to a specified currency
 *
 *  request : 
 *
 * {
 *    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
 *    endTime   : (any momentjs-readable date), // optional, defaults to now
 *    exchange  : {                             // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),         
 *      issuer    : "rAusZ...."                 // optional, required if currency != XRP
 *    }
 * }
 *
 * response : 
 *
 * {
 *    startTime    : "2014-03-13T20:39:26+00:00",       //period start
 *    endTime      : "2014-03-14T20:39:26+00:00",       //period end
 *    exchange     : {
 *      currency : "USD",                               //exchange currency
 *      issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"  //exchange issuer
 *    },
 *    exchangeRate : 0.014301217579817786,              //exchange rate
 *    total        : 726824.6504823748,                 //total value sent
 *    count        : 6040,                              //number of transactions
 *    components   : [                                  //list of component currencies
 *      {
 *        currency        : "USD",
 *        issuer          : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
 *        amount          : 27606.296227064257,
 *        count           : 51,
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
 *
    curl -H "Content-Type: application/json" -X POST -d '{
    "exchange"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}
    
    }' http://localhost:5993/api/total_value_sent 
    
 
 */

function totalValueSent(params, callback) {

  var viewOpts = {};
  var ex       = params.exchange || {currency:'XRP'};
  var cacheKey; 
  var startTime;
  var endTime;

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
  if (!params.startTime && !params.endTime) {

    if (!CACHE) {
      return callback('metric unavailable at this time');
    }
    
    redis.get('TVS:XRP:live', function(error, response){
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
  
  
  if (params.startTime && 
      params.endTime && 
      moment(params.startTime).isValid() && 
      moment(params.endTime).isValid()) {

    if (moment(params.startTime).isBefore(moment(params.endTime))) {
      startTime = moment.utc(params.startTime);
      endTime   = moment.utc(params.endTime);

    } else {
      endTime   = moment.utc(params.startTime);
      startTime = moment.utc(params.endTime);
    }

  } else if (params.endTime && moment(params.endTime).isValid()) {
    endTime   = moment.utc(params.endTime);
    startTime = moment.utc(params.endTime).subtract('hours', 24);

  } else {
    if (!moment(params.startTime).isValid()) {
      return callback('invalid startTime: ' + params.startTime + ' is invalid at: ' + moment(params.startTime).invalidAt());
    }

    if (!moment(params.endTime).isValid()) {
      return callback('invalid endTime: ' + params.endTime + ' is invalid at: ' + moment(params.endTime).invalidAt());
    }

    return callback("invalid time"); //should never get here
  }  

  if (endTime.isBefore(startTime)) { //swap times
    tempTime  = startTime;
    startTime = endTime;
    endTime   = tempTime;

  } else if (endTime.isSame(startTime)) {
    return callback('please provide 2 distinct times');
  }
  
  if (CACHE) {
    cacheKey = "TVS:" + ex.currency;
    if (ex.issuer) cacheKey += "."+ex.issuer;
    cacheKey += ":hist:"+startTime.unix()+":"+endTime.unix();
    
 
    redis.get(cacheKey, function(error, response){
      if (error)         return callback("Redis - " + error);
      else if (response) return callback(null, JSON.parse(response));  
      else transactionVolume({startTime:startTime, endTime:endTime, ex:ex}, callback);
    });
    
  } else transactionVolume({startTime:startTime, endTime:endTime, ex:ex}, callback);
}

    
/*  
    //prepare results to send back
    var response = {
      startTime : options.startTime.format(),
      endTime   : options.endTime.format(),
      exchange  : options.ex,  
    };
    
    var finalRate;
       
    // Mimic calling valueSent for each asset pair
    async.map(options.currencies, function(assetPair, asyncCallbackPair){
  
      require("./valueSent")({
        currency  : assetPair.currency,
        issuer    : assetPair.issuer,
        startTime : options.startTime,
        endTime   : options.endTime
        
      }, function(error, data) {

        if (error) return asyncCallbackPair(error);

        if (data && data.length > 1) {
          assetPair.amount = data[1][1]; 
          assetPair.count  = data[1][2];
        } else {
          assetPair.amount = 0;
          assetPair.count  = 0;
        }
        
        asyncCallbackPair(null, assetPair);
      
      });
  
    }, function(error, currencies) {

      if (error) return callback(error);
  
      getExchangeRates(options, function(error, rates){
        if (error) return callback(error);
        
        var finalRate = options.ex.currency == "XRP" ? 1 : null;
        
        rates.forEach(function(pair, index){
          currencies[index].rate            = pair.rate || 0; 
          currencies[index].convertedAmount = pair.rate ? currencies[index].amount / pair.rate : 0;
        
          //check to see if the pair happens to be the
          //final conversion currency we are looking for
          if (pair.counter.currency == options.ex.currency &&
              pair.counter.issuer   == options.ex.issuer) finalRate = pair.rate;
        });
        
        
        if (finalRate) finalize(options);
        else {
          getConversion({
            startTime : options.startTime,
            endTime   : options.endTime,
            currency  : options.ex.currency,
            issuer    : options.ex.issuer
            
          }, function(error, rate) {
            if (error) return callback (error);
            finalRate = rate;
            finalize(); 
          });
        }
             
        function finalize () {
          var total = 0, count = 0;
          currencies.forEach(function(currency, index) {
  
            if (currency.currency == "XRP") {
              currency.rate            = 1; //for XRP
              currency.convertedAmount = currency.amount;
            }
            
            currency.convertedAmount *= finalRate;
            currency.rate = currency.rate ? finalRate / currency.rate : 0;
            total += currency.convertedAmount;
            count += currency.count;
          });
        
          response.exchangeRate = finalRate;
          response.total        = total;
          response.count        = count;
          response.components   = currencies;
          
          if (CACHE) {
            cacheResponse (options.cacheKey, response);
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
        currency.rate *= rate;
      });

      data.exchange     = ex;
      data.exchangeRate = rate;
      data.total       *= rate;
      callback(null, data);     
    }
  });    
}
  



module.exports = totalValueSent;
