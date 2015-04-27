'use strict';
var winston = require('winston');
var moment = require('moment');
var async = require('async');
var utils = require('../utils');

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

function totalPayments(params, callback) {

  var rowkey;
  var startTime;
  var endTime;
  var interval;

  if (!params) params = {};
  interval  = (params.interval || '').toLowerCase();
  startTime = params.startTime;
  rowkey    = 'payment_volume';

  if (!startTime) {
    startTime = moment.utc().subtract(24, 'hours');
    endTime   = moment.utc();
    rowkey   += '|live';

  } else if (!interval || intervals.indexOf(interval) === -1) {
    callback('invalid interval');
    return;

  } else {
    startTime.startOf(interval === 'week' ? 'isoWeek' : interval);
    rowkey += '|' + interval + '|' + utils.formatTime(startTime);
    endTime = moment.utc(startTime).add(1, interval);
  }

  //prepare results to send back
  var response = {
    startTime    : startTime.format(),
    endTime      : endTime.format(),
    exchange     : {currency:'XRP'},
    exchangeRate : 1,
    total        : 0,
    count        : 0
  };


  //call valueSent for each asset pair
  async.map(currencies, function(c, asyncCallbackPair) {

    var currency = {
      currency : c.currency,
      issuer   : c.issuer
    };


    hbase.getPayments({
      currency: c.currency,
      issuer: c.issuer,
      start: startTime,
      end: endTime,
      interval: params.interval,
      reduce: params.interval ? false : true,
      descending: false

    }, function(err, data) {

      if (err) {
        asyncCallbackPair(err);
        return;
      }

      if (params.interval && data) {
        currency.amount = data.rows && data.rows[0] ? data.rows[0].amount : 0;
        currency.count = data.rows && data.rows[0] ? data.rows[0].count : 0;
      } else if (data) {
        currency.amount = data.amount;
        currency.count = data.count;
      } else {
        currency.amount = 0;
        currency.count = 0;
      }

      asyncCallbackPair(null, currency);

    });

  }, function(err, resp) {

    if (err) {
      if (callback) callback(err);
      return;
    }

    var currencies = resp;
    var options = {
      start    : startTime,
      end      : endTime,
      interval : interval
    };

    getExchangeRates(options, function(err, rates){
      if (err) {
        callback(err);
        return;
      }

      rates.forEach(function(pair, index){
        currencies[index].rate            = pair.rate || 0;
        currencies[index].convertedAmount = pair.rate ? currencies[index].amount / pair.rate : 0;
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
      callback (null, response);
    });
  });

  /*
   * get exchange rates for the listed currencies
   */

  function getExchangeRates (params, callback) {

    // Mimic calling offersExercised for each asset pair
    async.map(conversionPairs, function(assetPair, asyncCallbackPair){
      var options = {
        base      : assetPair.base,
        counter   : assetPair.counter,
        start     : params.start,
        end       : params.end,
        desending : false
      };

      if (params.interval === 'week') {
        options.interval = '7day';
      } else if (params.interval) {
        options.interval = '1' + params.interval;
      } else {
        options.reduce   = true;
      }

      hbase.getExchanges(options, function(err, resp) {

        if (err) {
          asyncCallbackPair(err);
          return;
        }

        if (resp.length) {
          resp = resp[0];
        }

        assetPair.rate =  resp ? resp.vwap : 0;
        asyncCallbackPair(null, assetPair);
      });

    }, function(error, results){
      if (error) return callback(error);
      return callback(null, results);
    });
  }

  function cacheResponse (rowkey, response) {
    var table = 'agg_metrics';
    hbase.putRow(table, rowkey, response);
    console.log('cacheing metric:', rowkey);
  }
}


module.exports = totalPayments;
