var winston = require('winston');
var moment  = require('moment');
var ripple  = require('ripple-lib');
var async   = require('async');
var offersExercised      = require('../../routes/offersExercised');
var issuerCapitalization = require('../../routes/issuerCapitalization');

//all currencies we are going to check    
var currencies = [ 
  {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp USD
  {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap USD
  {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp BTC
  {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap BTC
  {currency: 'BTC', issuer: 'rJHygWcTLVpSXkowott6kzgZU6viQSVYM1'}, //Justcoin BTC
  {currency: 'EUR', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap EUR
  {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //RippleCN CNY
  {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}, //RippleChina CNY
  {currency: 'CNY', issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'}, //RippleFox CNY
  {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'}, //RippleTradeJapan JPY
  {currency: 'JPY', issuer: 'r94s8px6kSw1uZ1MV98dhSRTvc6VMPoPcN'}, //TokyoJPY JPY
  {currency: 'JPY', issuer: 'rJRi8WW24gt9X85PHAxfWNPCizMMhqUQwg'}, //Ripple Market JPY
  {currency: 'XAU', issuer: 'r9Dr5xwkeLegBeXq6ujinjSBLQzQ1zQGjH'}, //Ripple Singapore XAU
  {currency: 'XAU', issuer: 'rrh7rf1gV2pXAoqA8oYbpHd8TKv5ZQeo67'}, //GBI XAU
  {currency: 'KRW', issuer: 'rUkMKjQitpgAM5WTGk79xpjT38DEJY283d'}, //Pax Moneta KRW
];

var conversionPairs = [];
currencies.forEach(function(currency) {

  if (currency.currency == 'XRP') {
    return;
  }

  conversionPairs.push({
    base    : {currency: 'XRP'},
    counter : currency
  });
});
 

function totalNetworkValue (params, callback) {

  var cacheKey;
  var ex;
  
  if (!params) params = {};
  
  ex = params.ex || {currency:'XRP'};
  
  cacheKey = "TNV:" + ex.currency.toUpperCase();
  if (ex.issuer) cacheKey += "."+ex.issuer;
  
  if (!params.time) {
    params.time = moment.utc();
    cacheKey   += ':live';
    
  } else {
    cacheKey += ":hist:"+params.time.unix();  
  }
    

  //prepare results to send back
  var response = {
    time     : params.time.format(),
    exchange : ex,  
  };
  
    
  // Mimic calling issuerCapitalization for the currencies
  issuerCapitalization({
      currencies : currencies,
      startTime  : moment.utc(0),
      endTime    : params.time,

  }, function(err, data) {

    if (err) return callback(err);

    getExchangeRates(function(error, rates) {
      if (error) return callback(error);

      var finalRate = ex.currency == "XRP" ? 1 : null;

      rates.forEach(function(pair, index){
        data[index].rate            = pair.rate; 
        data[index].convertedAmount = pair.rate ? data[index].amount / pair.rate : 0;

        //check to see if the pair happens to be the
        //final conversion currency we are looking for
        if (pair.counter.currency == ex.currency &&
            pair.counter.issuer   == ex.issuer) finalRate = pair.rate;
      });

      getXRPbalance(function(error, balance){
        if (error) return callback(error);

        data.push({
          currency : "XRP",
          amount   : balance
        })


        if (finalRate) finalize();
        else {
          getConversion({
            startTime : moment.utc(params.time).subtract(24, "hours"),
            endTime   : params.time,
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
        var total = 0;
        data.forEach(function(currency, index) {

          if (currency.currency === "XRP") {
            currency.rate            = 1; //for XRP
            currency.convertedAmount = currency.amount;
          }

          currency.convertedAmount *= finalRate;
          currency.rate = currency.rate ? finalRate / currency.rate : 0;
          total += currency.convertedAmount;
        });
        
        response.exchangeRate = finalRate;
        response.total        = total;
        response.components   = data;

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
   */
  
  function getExchangeRates (callback) {
    
    // Mimic calling offersExercised for each asset pair
    async.map(conversionPairs,  function(assetPair, asyncCallbackPair){
  
      offersExercised({
        base      : assetPair.base,
        counter   : assetPair.counter,
        startTime : moment.utc(params.time).subtract(24, "hours"),
        endTime   : params.time,
        timeIncrement: 'all'
        
      }, function(err, data) {
  
        if (err) return asyncCallbackPair(err);

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
      
    }, function(error, data) {
  
        if (error) return callback(error);
        if (data && data.length > 1) 
             callback(null,data[1][8]); // vwavPrice
        else callback({error:"cannot determine exchange rate"});
      
    });    
  }
  

/**
*  getLatestLedgerSaved gets the ledger with the highest
*  index saved in CouchDB
*/  
function getXRPbalance(callback) {
  db.list({descending:true, startkey:'_c', limit: 1}, function(error, res){
    if (error) return callback("CouchDB - " + error);  
    if (!res.rows.length) return callback("no ledgers saved"); //no ledgers saved;

    db.get(res.rows[0].id, function(error, res){
      if (error) return callback("CouchDB - " + error);
      return callback(null, res.total_coins / 1000000.0);  
    });
  });
} 

function cacheResponse (cacheKey, response) {
  redis.set(cacheKey, JSON.stringify(response), function(error, res){
    if (error) winston.error("Redis - " + error);
    if (DEBUG) winston.info(cacheKey + " cached");
  });
} 


module.exports = totalNetworkValue;