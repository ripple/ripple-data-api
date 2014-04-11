var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  async     = require('async');


/**
 *  topMarkets: 
 * 
 *  the total trading volume for the top 5 markets on the ripple network 
 *  for a given time period, normalized USD. Returns data for the last 24 hours 
 *  if no arguments are given.
 *
 * request:
 *
 * {
 *    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
 *    endTime   : (any momentjs-readable date), // optional, defaults to now
 *    exchange  : {                             // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),         
 *      issuer    : "rAusZ...."                 // optional, required if currency != XRP
 *    }
 *  }
 *
 * response:
 *
 * { 
 *    startTime    : '2014-03-13T20:26:24+00:00',   //period start
 *    endTime      : '2014-03-14T20:26:24+00:00',   //period end
 *    exchange     : { currency: 'XRP' },           //requested exchange currency
 *    exchangeRate : 1,                             //XRP exchange rate of requested currency
 *    total        : 1431068.4284775178,            //total volume in requested currency
 *    count        : 627,                           //number of trades
 *    components   : [                              //list of component markets
 *      { 
 *        base            : {"currency":"USD","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
 *        counter         : {"currency":"XRP"},
 *        rate            : 69.9309953931345,
 *        count           : 99,
 *        amount          : 3107.9273091242917,
 *        convertedAmount : 217340.45033656774 
 *      },
 *      .
 *      .
 *      .
 *    ]
 * }        
 *
 * 
 * 
   curl -H "Content-Type: application/json" -X POST -d '{
  
    }' http://localhost:5993/api/topMarkets 
 
 
   curl -H "Content-Type: application/json" -X POST -d '{
    "exchange"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}
  
    }' http://localhost:5993/api/topMarkets 
 
 */

function topMarkets(params, callback) {

  var cacheKey, viewOpts = {};
  var ex = params.exchange || {currency:"XRP"};
  
  if (typeof ex != 'object')               return callback('invalid exchange currency');
  else if (!ex.currency)                   return callback('exchange currency is required');
  else if (typeof ex.currency != 'string') return callback('invalid exchange currency');
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return callback('exchange issuer is required');
  else if (ex.currency == "XRP" && ex.issuer)
    return callback('XRP cannot have an issuer');

  //these must be traded in terms of XRP - perhaps we can change this later
  var marketPairs = [
    {
      // Bitstamp USD market
      base: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      counter: {currency: 'XRP'}
    },
    {
      // Bitstamp BTC market
      base: {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      counter: {currency: 'XRP'}
    },
    {
      // RippleCN CNY market
      base: {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'},
      counter: {currency: 'XRP'}
    },
    {
      // RippleChina CNY market
      base: {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'},
      counter: {currency: 'XRP'}
    },
    {
      // SnapSwap USD market
      base: {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
      counter: {currency: 'XRP'}
    },
    {
      base: {currency:'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'},
      counter: {currency:'XRP'}
    }
    
    
  ];



  //parse startTime and endTime
  var startTime, endTime;

  if (!params.startTime && !params.endTime) {

    startTime = moment.utc().subtract('hours', 24);
    endTime   = moment.utc();

  } else if (params.startTime && params.endTime && moment(params.startTime).isValid() && moment(params.endTime).isValid()) {

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
    cacheKey = "TM:" + ex.currency;
    if (ex.issuer) cacheKey += "."+ex.issuer;
    if (endTime.unix()==moment.utc().unix()) { //live update request
      cacheKey += ":live:"+endTime.diff(startTime, "seconds");
    } else {
      cacheKey += ":hist:"+startTime.unix()+":"+endTime.unix();
    }
 
    redis.get(cacheKey, function(error, response){
      if (error)    return callback("Redis - " + error);
      if (response) return callback(null, JSON.parse(response));  
      else fromCouch();
    });
    
  } else fromCouch();
  
  
  function fromCache(callback) {
    var response = redis.get(cacheKey, callback)  
  }
  
  function fromCouch() {
    //prepare results to send back
    var response = {
      startTime : startTime.format(),
      endTime   : endTime.format(),
      exchange  : ex,  
    };
   
    
    // Mimic calling offersExercised for each market pair
    async.map(marketPairs, function(assetPair, asyncCallbackPair){
  
      require("./offersExercised")({
        base          : assetPair.base,
        counter       : assetPair.counter,
        startTime     : startTime,
        endTime       : endTime,
        timeIncrement : 'all'
        
      }, function (error, data) {
  
        if (error) return asyncCallbackPair(error);

        if (data && data.length > 1) {
          assetPair.rate   = data[1][8]; // vwavPrice
          assetPair.count  = data[1][3]; // num trades
          assetPair.amount = data[1][1]; // amount
        } else {
          assetPair.rate   = 0;
          assetPair.count  = 0;
          assetPair.amount = 0;
        }
        asyncCallbackPair(null, assetPair);
        
      });
  
    }, function(error, pairs) {
      if (error) return callback(error);
      
      var exchangeRate;
      
      if (ex.currency == 'XRP') exchangeRate = 1;
      else {
        //check to see if the pair happens to be the
        //final conversion currency we are looking for
        pairs.forEach(function(pair, index){
          if (pair.base.currency == ex.currency &&
              pair.base.issuer   == ex.issuer) exchangeRate = 1 / pair.rate;
        });      
      }
  
  
      if (exchangeRate) finalize();
      else {
        getConversion({
          startTime : startTime,
          endTime   : endTime,
          currency  : ex.currency,
          issuer    : ex.issuer
        }, function(error, rate){
          if (error) return callback(error);
          exchangeRate = rate;
          finalize(); 
        });
      }
           
      function finalize () {
        var total = 0, count = 0;
        pairs.forEach(function(pair, index) {
          pair.rate            = pair.rate*exchangeRate;
          pair.convertedAmount = pair.amount*pair.rate;
          total += pair.convertedAmount;
          count += pair.count;
        });
      
        response.exchangeRate = exchangeRate;
        response.total        = total;
        response.count        = count;
        response.components   = pairs;
        
        callback(null, response);
          
        if (CACHE) {
          redis.set(cacheKey, JSON.stringify(response), function(error, res){
            if (error) return callback("Redis - " + error);
            
            redis.expire(cacheKey, 60); //expire in 60 seconds 
            if (DEBUG) winston.info(cacheKey + " cached");
            
          });
        }     
      }  
    });
  }


  /*
   * get XRP to specified currency conversion
   * 
   */
  function getConversion (params, callback) {
    
    // Mimic calling offersExercised 
    require("./offersExercised")({
      base      : {currency:"XRP"},
      counter     : {currency:params.currency,issuer:params.issuer},
      startTime : params.startTime,
      endTime   : params.endTime,
      timeIncrement : 'all'
      
    }, function(error, data) {
  
      if (error) return callback(error);
      if (data && data.length > 1) 
           callback(null,data[1][8]); // vwavPrice
      else callback("cannot determine exchange rate");
      
    });    
  }
}
module.exports = topMarkets;