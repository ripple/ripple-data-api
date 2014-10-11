var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  async     = require('async');

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

  var options = {};
  var ex = params.exchange || {currency:"XRP"};
  
  if (typeof ex != 'object')               return callback('invalid exchange currency');
  else if (!ex.currency)                   return callback('exchange currency is required');
  else if (typeof ex.currency != 'string') return callback('invalid exchange currency');
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return callback('exchange issuer is required');
  else if (ex.currency == "XRP" && ex.issuer)
    return callback('XRP cannot have an issuer');
 
  options.ex = ex;
 
  //all currencies we are going to check    
  options.currencies = [ 
    {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp USD
    {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp BTC
    {currency: 'BTC', issuer: 'rJHygWcTLVpSXkowott6kzgZU6viQSVYM1'}, //Justcoin BTC
    {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap USD
    {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap BTC
    {currency: 'EUR', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap EUR
    {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //RippleCN CNY
    {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}, //RippleChina CNY
    {currency: 'CNY', issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'}, //RippleFox CNY
    {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'}, //RippleTradeJapan JPY
    {currency: 'JPY', issuer: 'r94s8px6kSw1uZ1MV98dhSRTvc6VMPoPcN'}, //Tokyo JPY
    {currency: 'XRP'}
  ];

  options.conversionPairs = [];
  options.currencies.forEach(function(currency) {
    
    if (currency.currency == 'XRP') {
      return;
    }

    options.conversionPairs.push({
      base    : {currency: 'XRP'},
      counter : currency
    });
  });

  if (!params.startTime && !params.endTime) {

    options.startTime = moment.utc().subtract('hours', 24);
    options.endTime   = moment.utc();

  } else if (params.startTime && params.endTime && moment(params.startTime).isValid() && moment(params.endTime).isValid()) {

    if (moment(params.startTime).isBefore(moment(params.endTime))) {
      options.startTime = moment.utc(params.startTime);
      options.endTime   = moment.utc(params.endTime);
    } else {
      options.endTime   = moment.utc(params.startTime);
      options.startTime = moment.utc(params.endTime);
    }

  } else if (params.endTime && moment(params.endTime).isValid()) {
    
    options.endTime   = moment.utc(params.endTime);
    options.startTime = moment.utc(params.endTime).subtract('hours', 24);
    
  } else {

    if (!moment(params.startTime).isValid()) {
      return callback('invalid startTime: ' + params.startTime + ' is invalid at: ' + moment(params.startTime).invalidAt());
    }

    if (!moment(params.endTime).isValid()) {
      return callback('invalid endTime: ' + params.endTime + ' is invalid at: ' + moment(params.endTime).invalidAt());
    }

    return;
  }  
   
  if (options.endTime.isBefore(options.startTime)) { //swap times
    tempTime          = options.startTime;
    options.startTime = options.endTime;
    options.endTime   = tempTime;
  } else if (options.endTime.isSame(options.startTime)) {
    return callback('please provide 2 distinct times');
  }
    
  if (CACHE) fromCache(options);
  else fromCouch(options);
  
  function fromCache(options) {
    options.cacheKey = "TVS:" + ex.currency;
    if (options.ex.issuer) options.cacheKey += "."+options.ex.issuer;
    if (options.endTime.unix()==moment.utc().unix()) { //live update request
      options.cacheKey += ":live:"+options.endTime.diff(options.startTime, "seconds");

    } else {
      options.cacheKey += ":hist:"+options.startTime.unix()+":"+options.endTime.unix();
    }
 
    redis.get(options.cacheKey, function(error, response){
      if (error)                      return callback("Redis - " + error);
      if (response && params.history) return callback(null, true);
      else if (response)              return callback(null, JSON.parse(response));  
      else fromCouch(options);
    });    
  }
  
  function fromCouch(options) {  
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



  /*
   * get exchange rates for the listed currencies
   * 
   */
  function getExchangeRates (options, callback) {
    
    // Mimic calling offersExercised for each asset pair
    async.map(options.conversionPairs, function(assetPair, asyncCallbackPair){
  
      require("./offersExercised")({
        base      : assetPair.base,
        counter   : assetPair.counter,
        startTime : options.startTime,
        endTime   : options.endTime,
        timeIncrement: 'all'
       
      }, function(error, data) {
  
        if (error) return asyncCallbackPair(error);
        if (data && data.length > 1) 
              assetPair.rate = data[1][8]; // vwavPrice
        else  assetPair.rate = 0;
        
        asyncCallbackPair(null, assetPair);
        
      });
  
    }, function(error, results){
      if (error) return callback(error);
      return callback(null, results);
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
      counter   : {currency:params.currency,issuer:params.issuer},
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
  
  function cacheResponse (cacheKey, response) {
    redis.set(cacheKey, JSON.stringify(response), function(error, res){
      if (error) return callback("Redis - "+ error);
      if (cacheKey.indexOf(':live') !== -1) redis.expire(cacheKey, 240); //expire in 4 min
      if (DEBUG) winston.info(cacheKey + " cached");
    });
  }
}

module.exports = totalValueSent;
