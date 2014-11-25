var winston   = require('winston');
var moment    = require('moment');
var ripple    = require('ripple-lib');
var async     = require('async');

var valueSent       = require('../../routes/valueSent');
var offersExercised = require('../../routes/offersExercised');

var conversionPairs = [];
var currencies      = [ 
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
  {currency: 'JPY', issuer: 'rJRi8WW24gt9X85PHAxfWNPCizMMhqUQwg'}, //Ripple Market Japan JPY
  {currency: 'XRP'}
];

//populate conversion pairs
currencies.forEach(function(currency) {
    
  if (currency.currency == 'XRP') {
    return;
  }

  conversionPairs.push({
    base    : {currency: 'XRP'},
    counter : currency
  });
});

function totalValueSent(params, callback) {
  
  var cacheKey;
  var ex;
  var startTime;
  var endTime;
  
  if (!params) params = {};
  ex        = params.ex || {currency:'XRP'};
  startTime = params.startTime;
  endTime   = params.endTime;  
  cacheKey  = "TVS:" + ex.currency.toUpperCase();
  
  if (ex.issuer) cacheKey += "."+ex.issuer;
  
  if (!startTime && !endTime) {
    startTime = moment.utc().subtract('hours', 24);
    endTime   = moment.utc();
    cacheKey += ':live';
    
  } else {
    cacheKey += ":hist:"+startTime.unix()+":"+endTime.unix();  
  }
  
  //prepare results to send back
  var response = {
    startTime : startTime.format(),
    endTime   : endTime.format(),
    exchange  : ex,  
  };

  var finalRate;
       
  //call valueSent for each asset pair
  async.map(currencies, function(assetPair, asyncCallbackPair){

    valueSent({
      currency  : assetPair.currency,
      issuer    : assetPair.issuer,
      startTime : startTime,
      endTime   : endTime

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

  }, function(err, resp) {
    
    if (err) {
      if (callback) callback(err);
      return;
    }

    getExchangeRates(function(error, rates){
      if (error) return callback(error);

      var finalRate = ex.currency == "XRP" ? 1 : null;

      rates.forEach(function(pair, index){
        currencies[index].rate            = pair.rate || 0; 
        currencies[index].convertedAmount = pair.rate ? currencies[index].amount / pair.rate : 0;

        //check to see if the pair happens to be the
        //final conversion currency we are looking for
        if (pair.counter.currency == ex.currency &&
            pair.counter.issuer   == ex.issuer) finalRate = pair.rate;
      });


      if (finalRate) finalize();
      else {
        getConversion({
          startTime : startTime,
          endTime   : endTime,
          currency  : ex.currency,
          issuer    : ex.issuer

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
          cacheResponse (cacheKey, response);
        }

        if (callback) {
          callback(null, response);  
        }        
      }  
    });
  });
   

  /*
   * get exchange rates for the listed currencies
   * 
   */
  function getExchangeRates (callback) {
    
    // Mimic calling offersExercised for each asset pair
    async.map(conversionPairs, function(assetPair, asyncCallbackPair){
  
      offersExercised({
        base      : assetPair.base,
        counter   : assetPair.counter,
        startTime : startTime,
        endTime   : endTime,
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
}
  
/*
 * get XRP to specified currency conversion
 * 
 */

function getConversion (params, callback) {

  // Mimic calling offersExercised 
  offersExercised({
    base      : {currency:"XRP"},
    counter   : {currency:params.currency,issuer:params.issuer},
    startTime : params.startTime,
    endTime   : params.endTime,
    timeIncrement : 'all'
  }, 
  function(error, data) {
    if (error) return callback(error);
    if (data && data.length > 1) 
         callback(null,data[1][8]); // vwavPrice
    else callback("cannot determine exchange rate");
  });    
}
  
function cacheResponse (cacheKey, response) {
  redis.set(cacheKey, JSON.stringify(response), function(error, res){
    if (error) winston.error("Redis - " + error);
    if (DEBUG) winston.info(cacheKey + " cached");
  });
} 


module.exports = totalValueSent;