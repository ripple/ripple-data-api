var moment   = require('moment'),
    ripple   = require('ripple-lib'),
    async    = require('async'),
    _        = require('lodash'),
    utils    = require('../utils'),
    request  = require('request');


/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, returning both a volume weighted average and last price
 *  or the midpoint of the weighted averages of the bid and ask for the given pair
 *
 *  expects params to have with live != true:
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
 *    ],
 *    live: false
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
 *  expects params to have with live = true:
 *  if depth is not given but live == true, the midpoint of the best bid and ask will be returned
 *  {
 *    pairs    : [
 *      {
 *        base    : {currency:"USD","issuer":"bitstamp"},
 *        counter : {currency:"BTC","issuer":"bitstamp"}
 *        depth   : 10
 *      },
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
 *        counter : {currency:"XRP"},
 *        depth   : 100
 *      }
 *    ],
 *    live: true
 *
 *    base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"}, //required if "pairs" not present, for a single currency pair exchange rate
 *    counter : {currency:"XRP"}, //require if "pairs" not present, for a single currency pair exchange rate
 *  }
 *
 *  response :
 *  {
 *    pairs : [
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK","name":"rippleCN"},
 *        counter : {currency:"XRP"},
 *        rate    : //midpoint weighted average price of bid and ask
 *        depth   : //amount of currency the exchange rate is being checked for
 *      },
 *
 *      ....
 *    ]
 *  }

  Call with live = true:

  curl -H "Content-Type: application/json" -X POST -d '{
    "pairs" : [{
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"},
      "depth":1
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"},
      "depth":10
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"},
      "depth":50
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"},
      "depth":100
    }],
    "live":true
  }' http://localhost:5993/api/exchangerates

  Calls with live = false:

  curl -H "Content-Type: application/json" -X POST -d '{
    "pairs" : [{
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"}
    },
    {
      "base":{"currency":"USD","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XRP"}
    },
    {
      "base":{"currency":"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
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
  var startTime = moment.utc(0);
  var endTime   = moment.utc(params.time);
  var live      = params.live;
  var list      = [];
  var pairs;
  var currencyPair;

  if (params.pairs && Array.isArray(params.pairs))
    pairs = params.pairs;
  else if (params.base && params.counter)
    pairs = [{base:params.base,counter:params.counter, depth:params.depth}];
  else
    return callback('please specify a list of currency pairs or a base and counter currency');

  //invalid number of pairs
  if (pairs.length > 50) return callback('cannot retrieve more than 50 pairs');

  for (var i=0; i<pairs.length; i++) {
    currencyPair = parseCurrencyPair(pairs[i]);

    if (currencyPair) {
      if (live && pairs[i].depth) {
        if (pairs[i].depth <= 0) {
          callback('invalid depth: ' + JSON.stringify(pair));
          return;
        }

        currencyPair.depth = pairs[i].depth;
      }

      list.push(currencyPair);

    } else {
      callback('invalid currency pair: ' + JSON.stringify(pair));
      return;
    }
  }

  async.mapLimit(list, 50, function(pair, asyncCallbackPair) {

    //live request must go to rippled
    if (live) {
      midpoint_rate(pair, pair.depth, function(error, avg) {
        if (error) return asyncCallbackPair(error);
        else{
          pair.rate = avg;
          asyncCallbackPair(null, pair);
        }
      });

    //otherwise go to hbase
    } else {
      var options = {
        start      : startTime,
        end        : endTime,
        base       : pair.base,
        counter    : pair.counter,
        descending : true
      };

      if (params.last) {
        options.limit  = 1;
      } else {
        options.limit  = 50;
        options.reduce = true;
      }

      hbase.getExchanges(options, function(err, data) {
        if (err) {
          asyncCallbackPair(err);
          return;
        }

        if (params.last) {
            pair.last = data && data.length > 1 ? data[1].rate : 0;

        } else {
          if (data) {
            pair.rate = data.vwap;
            pair.last = data.close;

          } else {
            pair.rate = 0;
          }
        }
        asyncCallbackPair(null, pair);
      });
    }
  }, function(error, results) {
    if (error) return callback(error);
    var finalResults = _.filter(results, function(result) { return result.rate !== 0; });
    return callback (null, finalResults);
  });
}

function midpoint_rate(pair, depth, mpCallback) {
  var bid = call_builder('bid', pair),
      ask = call_builder('ask', pair);

  //Make both bid and ask api calls in parallel and process the results
  async.parallel({
      bid_avg: function(callback) {
        process_offers(bid, 'bid', depth, function(error, br) {
          if (!error) callback(null, br);
          else callback(error);
        });
      },
      ask_avg: function(callback) {
        process_offers(ask, 'ask', depth, function(error, ar) {
          if (!error) callback(null, ar);
          else callback(error);
        });
      }
  },
  //Return results
  function(error, results) {
    if (error) mpCallback(error);
    else{
      var midpoint = (results.bid_avg + results.ask_avg)/2;
      mpCallback(null, midpoint);
    }
  });
}

//Make api call to rippled to get orderbooks
function process_offers(json, ba, depth, callback) {
  request.post(
    'http://s1.ripple.com:51234/',
    {json: json},
    function (error, response, body) {
      if (!error) {
        var offers = body.result.offers;
        weighted_average(offers, ba, depth, function(error, wavg) {
          if(!error) callback(null, wavg);
          else callback(error);
        });
      }
      else{
        callback(error);
      }
    }
  );
}

//Find weighted average given offers
function weighted_average(offers, ba, depth, callback) {
  var waverage = 0,
      total    = 0,
      taker_gets,
      taker_pays;
  //Iterate through offers until depth is reached.
  for (var index in offers) {
    var offer = offers[index],
        exchange,
        value;
    //Check whether TakerGets.value and TakerPays.value exist.
    if (offer.TakerGets.value) taker_gets = offer.TakerGets.value;
    else taker_gets = offer.TakerGets/1000000;
    if (offer.TakerPays.value) taker_pays =  offer.TakerPays.value;
    else taker_pays =  offer.TakerPays/1000000;
    //Bid or Ask
    if (ba === 'bid') {
      exchange = taker_gets/taker_pays;
      value = Number(taker_pays);
    }
    else {
      exchange = taker_pays/taker_gets;
      value = Number(taker_gets);
    }
    //If depth is 0, return exchange rate of first offer.
    if(!depth) {
      return callback(null, exchange);
    }
    //If over depth, find difference.
    if (total+value > depth) {
      value = depth-total;
    }
    //Add weighted exchange rate.
    waverage += exchange * (value/depth);
    total += value;
    //If depth has been reached, break.
    if (total >= depth) {
      break;
    }
  }
  //If limit of offers is reached and depth hasn't been reached, return error.
  if (total < depth && offers.length > 299) {
    return callback('cannot retrieve more than 300 orders, try lowering the depth');
  }
  //If the given depth cannot be reached, return error.
  else if (total < depth) {
    return callback('cannot retrieve offers with such a high depth, try lowering the depth');
  }

  return callback(null, waverage);
}


/* HELPER FUNCTIONS */

//Builds API call based on currencies provided and (xrp has no issuer).
function call_builder(ba, pair) {
  var currencyPair = parseCurrencyPair(pair),
      tg,
      tp,
      call;
  if (ba === 'ask') {
    tg = currencyPair.base;
    tp = currencyPair.counter;
  }
  else {
    tg = currencyPair.counter;
    tp = currencyPair.base;
  }
  call = {
    'method': 'book_offers',
    'params':
    [
      {
        'taker_gets': tg,
        'taker_pays': tp,
      }
    ]
  };
  return call;
}

//format valid currency pairs, reject invalid
function parseCurrencyPair (pair) {
  var base,
      counter;

  if (!pair.base|| !pair.counter) return;

  base  = parseCurrency(pair.base);
  counter = parseCurrency(pair.counter);

  if (!base || !counter) return;
  return {base:base,counter:counter};
}

//format valid currency-issuer combinations, reject invalid
function parseCurrency (c) {
  var currency,
      name,
      issuer;

  if (!c.currency) return;
  else {
    currency = c.currency.toUpperCase();

    if (currency == 'XRP') {
      if (c.issuer) return null;   //XRP should not have an issuer
      return {currency:'XRP'};
    }

    else if (currency != 'XRP' && !c.issuer) return null;  //IOUs must have an issuer
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
