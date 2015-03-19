var winston   = require('winston');
var moment    = require('moment');
var ripple    = require('ripple-lib');
var async     = require('async');
var valueSent = require('../../routes/valueSent');
var utils     = require('../utils');

var intervals = [
  'hour',
  'day',
  'week',
  'month'
];

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
  {currency: 'KRW', issuer: 'rUkMKjQitpgAM5WTGk79xpjT38DEJY283d'}, //Pax Moneta KRW
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

  var rowkey;
  var ex;
  var startTime;
  var endTime;
  var interval;

  if (!params) params = {};
  ex        = params.ex || {currency:'XRP'};
  interval  = (params.interval || '').toLowerCase();
  startTime = params.startTime;
  rowkey    = 'transaction_volume';

  if (!startTime) {
    startTime = moment.utc().subtract(24, 'hours');
    endTime   = moment.utc();
    rowkey   += '|live';

  } else if (!interval || intervals.indexOf(interval) === -1) {
    callback('invalid interval');
    return;

  } else {
    startTime.startOf(interval);
    rowkey += '|' + interval + '|' + utils.formatTime(startTime);
    endTime = moment.utc(startTime).add(1, interval);
  }

  //prepare results to send back
  var response = {
    startTime    : startTime.format(),
    endTime      : endTime.format(),
    exchange     : ex,
    exchangeRate : 1,
    total        : 0,
    count        : 0
  };

  var finalRate;

  //call valueSent for each asset pair
  async.map(currencies, function(c, asyncCallbackPair){

    var currency = {
      currency : c.currency,
      issuer   : c.issuer
    };

    valueSent({
      currency  : c.currency,
      issuer    : c.issuer,
      startTime : startTime,
      endTime   : endTime

    }, function(error, data) {

      if (error) return asyncCallbackPair(error);

      if (data && data.length > 1) {
        currency.amount = data[1][1];
        currency.count  = data[1][2];
      } else {
        currency.amount = 0;
        currency.count  = 0;
      }

      asyncCallbackPair(null, currency);

    });

  }, function(err, resp) {

    if (err) {
      if (callback) callback(err);
      return;
    }

    var currencies = resp;

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


      currencies.forEach(function(currency, index) {

        if (currency.currency == "XRP") {
          currency.rate            = 1; //for XRP
          currency.convertedAmount = currency.amount;
        }

        response.total += currency.convertedAmount;
        response.count += currency.count;
      });

      response.components = currencies;

      //cache XRP normalized version
      cacheResponse (rowkey, response);

      var options = {
        rate  : finalRate,
        start : startTime,
        end   : endTime
      };

      //finalize the response
      handleResponse(options, response, callback);
    });
  });

  function handleResponse(options, resp, callback) {

    //normalized to XRP, nothing to do
    if (options.rate === 1) {
      callback (null, resp);

    //already have the final rate,
    //just apply it
    } else if (options.rate) {
      finalize(rate);

    //get the final rate
    } else {
      getConversion({
        startTime : options.start,
        endTime   : options.end,
        currency  : resp.exchange.currency,
        issuer    : resp.exchange.issuer

      }, function(error, finalRate) {
        if (error) {
          callback (error);
          return;
        }

        finalize(finalRate);
      });
    }

    function finalize (rate) {
      resp.total = 0;
      resp.components.forEach(function(c, index) {

        c.convertedAmount *= rate;
        c.rate      = c.rate ? rate / c.rate : 0;
        resp.total += c.convertedAmount;
      });

      response.exchangeRate = rate;

      if (callback) {
        callback(null, response);
      }
    }
  }

  /*
   * get exchange rates for the listed currencies
   *
   */
  function getExchangeRates (callback) {

    // Mimic calling offersExercised for each asset pair
    async.map(conversionPairs, function(assetPair, asyncCallbackPair){

      hbase.getExchanges( {
        base    : assetPair.base,
        counter : assetPair.counter,
        start   : startTime,
        end     : endTime,
        reduce  : true
      }, function(err, resp) {

        if (err) {
          asyncCallbackPair(err);
          return;
        }

        assetPair.rate =  resp ? resp.vwap : 0;
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

    hbase.getExchanges( {
      base    : {currency:"XRP"},
      counter : {currency:params.currency,issuer:params.issuer},
      start   : startTime,
      end     : endTime,
      reduce  : true
    }, function(err, resp) {
      if (err) {
        callback(error);
        return;
      }

      if (resp) {
        callback(null, resp.vwap); // vwavPrice
      } else {
        callback("cannot determine exchange rate");
      }
    });
  }

  function cacheResponse (rowkey, response) {
    var table = 'agg_metrics';
    hbase.putRow(table, rowkey, response);
    console.log('cacheing metric:', rowkey);
  }
}


module.exports = totalValueSent;
