var moment = require('moment'),
  ripple   = require('ripple-lib'),
  async    = require('async'),
  _        = require('lodash'),
  utils    = require('../utils');

/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, broken down by the given time increment
 *
 *  expects req.body to have:
 *  {
 *    pairs    : [
 *      {
 *        base  : {currency:"USD","issuer":"bitstamp"},
 *        trade : {currency:"BTC","issuer":"bitstamp"}
 *      },
 *      {
 *        base  : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
 *        trade : {currency:"XRP"}
 *      }
 *    ]
 *  
 *    base  : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"}, //required if "pairs" not present, for a single currency pair exchange rate
 *    trade : {currency:"XRP"}, //require if "pairs" not present, for a single currency pair exchange rate
 *    range : "hour", "day", "week", "month", year",  //time range to average the price over, defaults to "day"
 *  }
 * 
 *  response :
 *  {
 *    pairs : [
 *      {
 *        base  : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK","name":"rippleCN"},
 *        trade : {currency:"XRP"},
 *        rate  : //volume weighted average price
 *        last  : //last trade price
 *        range : "hour", "day", "month", year" - from request
 *      },
 * 
 *      ....
 *    ] 
 *  }
 * 
 */

function exchangeRates ( req, res) {
  var pairs, list = [];
  var endTime = moment.utc();
  var range   = req.body.range || "day"; 
  
  if (range=="hour")       startTime = moment.utc().subtract("hours", 1);
  else if (range=="day")   startTime = moment.utc().subtract("days", 1);
  else if (range=="week")  startTime = moment.utc().subtract("weeks", 1);
  else if (range=="month") startTime = moment.utc().subtract("months", 1);
  else if (range=="year")  startTime = moment.utc().subtract("years", 1);
  else { 
    
    //invalid range
    res.send(500, { error: 'invalid time range' }); 
  }
  
  if (req.body.pairs && Array.isArray(req.body.pairs)) 
    pairs = req.body.pairs;
  else if (req.body.base && req.body.trade) 
    pairs = [{base:req.body.base,trade:req.body.trade}];
  else {
    //pairs or base and trade required
    res.send(500, { error: 'please specify a list of currency pairs or a base and trade currency'});
  }
  
  pairs.forEach(function(pair){
    var currencyPair = parseCurrencyPair(pair);
    
    if (currencyPair) list.push(currencyPair);
    else { 
      //invalid currency pair
      res.send(500, { error: 'invalid currency pair: ' + JSON.stringify(pair) });
    }
  });
  

//call offersExercised for each asset pair
  async.mapLimit(list, 10, function(pair, asyncCallbackPair){

    require("./offersExercised")({
      body: {
        base      : pair.base,
        trade     : pair.trade,
        startTime : startTime,
        endTime   : endTime,
        timeIncrement : 'all'
      }
    }, {
      send: function(data) {

        if (data.error) {
          asyncCallbackPair(data.error);
          return;
        }

        if (data && data.length > 1) {
          pair.rate = data[1][8]; // volume weighted average price
          pair.last = data[1][5]; // close price
        } else {
          pair.rate = 0;
        }
        asyncCallbackPair(null, pair);
      }
    });

  }, function(err, results){
    if (err) {
      res.send(500, { error: err });
      return;
    }

    var finalResults = _.filter(results, function(result){ return result.rate !== 0; });
    res.send(finalResults);
  });
}

/* HELPER FUNCTIONS */

//format valid currency pairs, reject invalid
function parseCurrencyPair (pair) {
  var base, trade;
  
  if (!pair.base|| !pair.trade) return;
  
  base  = parseCurrency(pair.base);
  trade = parseCurrency(pair.trade); 
  
  if (!base || !trade) return;
  return {base:base,trade:trade};
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



/* DEPRECIATED
  
 
function exchangeRatesHandler( req, res ) {

  var startTime = moment().subtract('weeks', 1),
    endTime = moment();

  var gateways = [],
    currencies = [],
    gatewayCurrencyPairs = [];

  // Parse gateways
  if (typeof req.body.gateways === 'object') {

    req.body.gateways.forEach(function(gateway){
      var parsedGateway = parseGateway(gateway);
      if (parsedGateway) {
        gateways.push(parsedGateway);
      } else {
        res.send(500, { error: 'invalid or unknown gateway: ' + gateway });
        return;
      }
    });

  }

  function parseGateway (nameOrAddress) {
    // Check if gateway is a name or an address
    if (ripple.UInt160.is_valid(nameOrAddress)) {

      var gatewayName = getGatewayName(nameOrAddress);
      if (gatewayName !== '') {
        return parseGateway(gatewayName)
      } else {
        return { address: nameOrAddress };        
      }

    } else if (gatewayNameToAddress(nameOrAddress)){
      var gateway = {
        name: nameOrAddress, 
        address: gatewayNameToAddress(nameOrAddress)
      },
      hotwallets = getHotWalletsForGateway(nameOrAddress);

      if (hotwallets.length > 0) {
        gateway.hotwallets = hotwallets;
      }

      return gateway;
    } else {
      return null;
    }
  }

  // Parse currencies
  var includeXRP = false;
  if (typeof req.body.currencies === 'object') {
    req.body.currencies.forEach(function(currency){
      if (currency === 'XRP') {
        includeXRP = true;
      } else {
        currencies.push(currency.toUpperCase());
      }
    });
  }


  // Get gateway/currency pairs to query CouchDB for
  if (gateways.length > 0 && currencies.length > 0) {
    gateways.forEach(function(gateway){
      currencies.forEach(function(currency){
        var pair = { 
          address: gateway.address,
          currency: currency
        };
        if (gateway.name) {
          pair.name = gateway.name;
        }
        if (gateway.hotwallets && gateway.hotwallets.length > 0) {
          pair.hotwallets = gateway.hotwallets;
        }
        gatewayCurrencyPairs.push(pair);
      });
    });
  } else if (gateways.length > 0 && currencies.length === 0) {

    if (_.every(gateways, function(gateway){ return gateway.name; })) {
      gateways.forEach(function(gateway){
        getCurrenciesForGateway(gateway.name).forEach(function(currency){
          gatewayCurrencyPairs.push({
            address: gateway.address,
            currency: currency,
            name: gateway.name,
            hotwallets: gateway.hotwallets
          });
        });
      });
    } else {
      res.send(500, { error: 'please specify currencies or use gateway names instead of accounts' });
      return;
    }

  } else if (gateways.length === 0 && currencies.length > 0) {

    currencies.forEach(function(currency){
      getGatewaysForCurrency(currency).forEach(function(gateway){
        gatewayCurrencyPairs.push({
          address: gateway.account,
          currency: currency,
          name: gateway.name,
          hotwallets: getHotWalletsForGateway(gateway.name)
        });
      });
    });

  } else {
    res.send(500, { error: 'please specify at least one gateway and/or at least one currency'});
    return;
  }

  var assetPairs = [];

  for (var t = 0; t < gatewayCurrencyPairs.length; t++) {
    var trade = gatewayCurrencyPairs[t];

    if (includeXRP) {
      assetPairs.push({
        base: {currency: 'XRP'},
        trade: {currency: trade.currency, issuer: trade.address}
      });
    }

    for (var b = t + 1; b < gatewayCurrencyPairs.length; b++) {
      var base = gatewayCurrencyPairs[b];

      if (base) {
        assetPairs.push({
          base: {currency: base.currency, issuer: base.address},
          trade: {currency: trade.currency, issuer: trade.address}
        });
      }
    }
  }

  // Mimic calling offersExercised for each asset pair
  async.mapLimit(assetPairs, 10, function(assetPair, asyncCallbackPair){

    require("./routes/offersExercised")({
      body: {
        base: assetPair.base,
        trade: assetPair.trade,
        startTime: startTime,
        endTime: endTime,
        timeIncrement: 'all'
      }
    }, {
      send: function(data) {

        if (data.error) {
          asyncCallbackPair(data.error);
          return;
        }

        if (data && data.length > 1) {
          assetPair.rate = data[1][8]; // vwavPrice
        } else {
          assetPair.rate = 0;
        }
        asyncCallbackPair(null, assetPair);
      }
    });

  }, function(err, results){
    if (err) {
      res.send(500, { error: err });
      return;
    }

    var finalResults = _.filter(results, function(result){ return result.rate !== 0; });

    res.send(finalResults);
  });


}
*/
module.exports = exchangeRates;