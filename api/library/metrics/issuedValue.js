var winston = require('winston');
var moment  = require('moment');
var ripple  = require('ripple-lib');
var async   = require('async');
var issuerCapitalization = require('../../routes/issuerCapitalization');
var utils   = require('../utils');

//all currencies we are going to check
var currencies = [
  {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp USD
  {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap USD
  {currency: 'USD', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'}, //Gatehub USD
  {currency: 'USD', issuer: 'r9Dr5xwkeLegBeXq6ujinjSBLQzQ1zQGjH'}, //Ripple Singapore USD
  {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},  //Bitstamp BTC
  {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap BTC
  {currency: 'BTC', issuer: 'rJHygWcTLVpSXkowott6kzgZU6viQSVYM1'}, //Justcoin BTC
  {currency: 'EUR', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}, //Snapswap EUR
  {currency: 'EUR', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'}, //GateHub EUR
  {currency: 'EUR', issuer: 'rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun'}, //The Rock EUR
  {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}, //RippleCN CNY
  {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'}, //RippleChina CNY
  {currency: 'CNY', issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'}, //RippleFox CNY
  {currency: 'CNY', issuer: 'rM8199qFwspxiWNZRChZdZbGN5WrCepVP1'}, //DotPayco CNY
  {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'}, //RippleTradeJapan JPY
  {currency: 'JPY', issuer: 'r94s8px6kSw1uZ1MV98dhSRTvc6VMPoPcN'}, //TokyoJPY JPY
  {currency: 'JPY', issuer: 'rJRi8WW24gt9X85PHAxfWNPCizMMhqUQwg'}, //Ripple Market JPY
  {currency: 'JPY', issuer: 'r9ZFPSb1TFdnJwbTMYHvVwFK1bQPUCVNfJ'}, //Ripple Exchange Tokyo JPY
  {currency: 'JPY', issuer: 'rB3gZey7VWHYRqJHLoHDEJXJ2pEPNieKiS'}, //Ripple Exchange Tokyo JPY
  {currency: 'XAU', issuer: 'r9Dr5xwkeLegBeXq6ujinjSBLQzQ1zQGjH'}, //Ripple Singapore XAU
  {currency: 'XAU', issuer: 'rrh7rf1gV2pXAoqA8oYbpHd8TKv5ZQeo67'}, //GBI XAU
  {currency: 'KRW', issuer: 'rUkMKjQitpgAM5WTGk79xpjT38DEJY283d'}, //Pax Moneta KRW
  {currency: 'STR', issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'}, //Ripple Fox STR
  {currency: 'FMM', issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'}, //Ripple Fox FMM
  {currency: 'MXN', issuer: 'rG6FZ31hDHN1K5Dkbma3PSB5uVCuVVRzfn'}  //Bitso MXN
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


function issuedValue (params, callback) {

  var rowkey;

  if (!params) params = {};

  rowkey = 'issued_value';

  if (!params.time) {
    params.time = moment.utc();
    rowkey   += '|live';

  } else {
    params.time = moment.utc(params.time).startOf('hour');
    rowkey += '|' + utils.formatTime(params.time);
  }

  //prepare results to send back
  var response = {
    time         : params.time.format(),
    exchange     : {currency:'XRP'},
    exchangeRate : 1,
    total        : 0,
    components   : []
  };

  //call issuerCapitalization for
  //each of the currencies
  issuerCapitalization({
      currencies : currencies,
      startTime  : moment.utc(0),
      endTime    : params.time,

  }, function(err, data) {

    if (err) {
      console.log(err);
      callback(err);
      return;
    }

    getExchangeRates(params.time, function(error, rates) {
      if (error) return callback(error);

      rates.forEach(function(pair, i) {
        var amount = data[i].results && data[i].results.length ? data[i].results[0][1] : 0;
        var rate = pair.rate || 0;
        response.components.push({
          currency: data[i].currency,
          issuer: data[i].issuer,
          rate: rate,
          amount: amount,
          convertedAmount: rate && amount ? amount / rate : 0
        });
      });

      response.components.forEach(function(c) {
        response.total += c.convertedAmount;
      });

      //cache XRP normalized version
      cacheResponse (rowkey, response);
      callback (null, response);
    });
  });

  /*
   * get exchange rates for the listed currencies
   *
   */

  function getExchangeRates (time, callback) {

    // Mimic calling offersExercised for each asset pair
    async.map(conversionPairs, function(assetPair, asyncCallbackPair){

      hbase.getExchanges( {
        base       : assetPair.base,
        counter    : assetPair.counter,
        start      : moment.utc(time).subtract(1, 'day'),
        end        : time,
        interval   : '1day',
        descending : false
      }, function(err, resp) {

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


module.exports = issuedValue;
