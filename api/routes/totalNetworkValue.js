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
 
function totalNetworkValue( req, res ) {

  var cachKey, live, viewOpts = {};
  var ex = req.body.exchange || {currency:"XRP"};
  
  if (typeof ex != 'object')               return res.send(500, {error: 'invalid exchange currency'});
  else if (!ex.currency)                   return res.send(500, {error: 'exchange currency is required'});
  else if (typeof ex.currency != 'string') return res.send(500, {error: 'invalid exchange currency'});
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return res.send(500, {error: 'exchange issuer is required'});
  else if (ex.currency == "XRP" && ex.issuer)
    return res.send(500, {error: 'XRP cannot have an issuer'});
 
 
  //all currencies we are going to check    
  var currencies = [ 
    {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp USD
    {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp BTC
    {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap USD
    {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //RippleCN CNY
    {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}, //RippleChina CNY
  ];
  
  //XRP conversion rates for each of the currencies - these must be in the same order as above  
  var conversionPairs = [
    {
      //XRP value of Bitstamp USD
      base  : {currency: 'XRP'},
      trade : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      //XRP value of Bitstamp BTC
      base  : {currency: 'XRP'},
      trade : {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      //XRP value of Snapswap USD
      base  : {currency: 'XRP'},
      trade : {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}
    },
    {
      //XRP value of RippleCN CNY
      base  : {currency: 'XRP'},
      trade : {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}
    },
    {
      //XRP value of RippleChina CNY
      base: {currency: 'XRP'},
      trade: {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}
    }
  ];
  
  
  //parse startTime and endTime
  var time = moment.utc(req.body.time);

  if (!time.isValid()) {
    res.send(500, { error: 'invalid time: ' + req.body.time});
    return;
  } 

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
      live = true; //we will set an expiration on this key
    } else {
      cacheKey += ":hist:"+time.unix();
    }
 
    redis.get(cacheKey, function(err, response){
      if (err) winston.error("cache error:", err);
      if (response) res.send(JSON.parse(response));  
      else fromCouch();
    });
    
  } else fromCouch();
  
  function fromCouch() {

    // Mimic calling issuerCapitalization for the currencies
    require("./issuerCapitalization")({
      body: {
        pairs  : currencies,
        startTime : moment.utc(0),
        endTime : moment.utc(),
      }
    }, {
      send: function(data, err) {

        if (err) return res.send(500, err);
        currencies = data;
        
        
        getExchangeRates(time, conversionPairs, function(err, rates){
          if (err) return res.send(500, { error: err });
          
          var finalRate = ex.currency == "XRP" ? 1 : null;
          
          rates.forEach(function(pair, index){
    
            currencies[index].rate            = pair.rate; 
            currencies[index].convertedAmount = pair.rate ? currencies[index].amount / pair.rate : 0;
          
            //check to see if the pair happens to be the
            //final conversion currency we are looking for
            if (pair.trade.currency == ex.currency &&
                pair.trade.issuer   == ex.issuer) finalRate = pair.rate;
          });
          
          getXRPbalance(function(err, balance){
            if (err) return res.send(500, { error: err });
            
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
              }, function(err,rate){
                if (err) return res.send(500, { error: err });
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
            
            res.send(response);   
            if (CACHE) {

              redis.set(cacheKey, JSON.stringify(response), function(err, res){
                if (err) winston.error("cache error:", err);
                else {
                  if (live) redis.expire(cacheKey, 60); //expire in 60 seconds  
                  if (DEBUG) winston.info(cacheKey+" cached");
                }
              });
            }      
          }
                  
        });      
      }
    });
  }
  
  /*
   * get exchange rates for the listed currencies
   * 
   */
  function getExchangeRates (time, pairs, callback) {
    
    // Mimic calling offersExercised for each asset pair
    async.mapLimit(pairs, 10, function(assetPair, asyncCallbackPair){
  
      require("./offersExercised")({
        body: {
          base  : assetPair.base,
          trade : assetPair.trade,
          startTime : moment.utc(time).subtract("hours",72),
          endTime   : time,
          timeIncrement: 'all'
        }
      }, {
        send: function(data) {
  
          if (data.error) return asyncCallbackPair(data.error);
  
          if (data && data.length > 1) 
                assetPair.rate = data[1][8]; // vwavPrice
          else  assetPair.rate = 0;
          
          asyncCallbackPair(null, assetPair);
        }
      });
  
    }, function(err, results){
      if (err) return callback(err);
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
      body: {
        base      : {currency:"XRP"},
        trade     : {currency:params.currency,issuer:params.issuer},
        startTime : params.startTime,
        endTime   : params.endTime,
        timeIncrement : 'all'
      }
    }, {
      send: function(data) {
  
        if (data.error) return callback(data.error);
        if (data && data.length > 1) 
             callback(null,data[1][8]); // vwavPrice
        else callback({error:"cannot determine exchange rate"});
      }
    });    
  }
  
  
 /**
  *  getLatestLedgerSaved gets the ledger with the highest
  *  index saved in CouchDB
  */  
  function getXRPbalance(callback) {
    db.list({descending:true, startkey:'_c', limit: 1}, function(err, res){
      if (err) {
        callback(err);
        return;
      }
      
      if (!res.rows.length) return callback("no ledgers saved"); //no ledgers saved;
  
      db.get(res.rows[0].id, function(err, res){
        if (err) return callback(err);
        return callback(null, res.total_coins / 1000000.0);  
      });
    });
  }  
}

module.exports = totalNetworkValue;