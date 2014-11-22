var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  async     = require('async');
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

  var cacheKey, viewOpts = {};
  var ex = params.exchange || {currency:"XRP"};
  
  if (typeof ex != 'object')               return callback('invalid exchange currency');
  else if (!ex.currency)                   return callback('exchange currency is required');
  else if (typeof ex.currency != 'string') return callback('invalid exchange currency');
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return callback('exchange issuer is required');
  else if (ex.currency == "XRP" && ex.issuer)
    return callback('XRP cannot have an issuer');
 
 
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
  
  
  //parse startTime and endTime
  var time = moment.utc(params.time);

  if (!time.isValid()) return callback('invalid time: ' + params.time);

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
  
  /*
   * get exchange rates for the listed currencies
   * 
   */
  function getExchangeRates (time, pairs, callback) {
    
    // Mimic calling offersExercised for each asset pair
    async.map(pairs,  function(assetPair, asyncCallbackPair){
  
      require("./offersExercised")({
        base      : assetPair.base,
        counter   : assetPair.counter,
        startTime : moment.utc(time).subtract("hours",72),
        endTime   : time,
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
      if (error) return callback("Redis - " + error);  
      if (cacheKey.indexOf(':live') !== -1) redis.expire(cacheKey, 240); //expire in 4 min
      if (DEBUG) winston.info(cacheKey+" cached");
    });
  } 
}

module.exports = totalNetworkValue;