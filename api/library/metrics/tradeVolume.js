var winston = require('winston');
var moment  = require('moment');
var ripple  = require('ripple-lib');
var async   = require('async');
var offersExercised = require('../../routes/offersExercised');

var marketPairs = [
  {
    // Bitstamp USD market
    base: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
    counter: {currency: 'XRP'}
  },
  {
    // Bitstamp BTC market
    base: {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
    counter: {currency: 'XRP'}
  },
  {
    // RippleCN CNY market
    base: {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'},
    counter: {currency: 'XRP'}
  },
  {
    // RippleChina CNY market
    base: {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'},
    counter: {currency: 'XRP'}
  },
  {
    // RippleFox CNY market
    base: {currency: 'CNY', issuer: 'rKiCet8SdvWxPXnAgYarFUXMh1zCPz432Y'},
    counter: {currency: 'XRP'}
  },
  {
    // SnapSwap USD market
    base: {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
    counter: {currency: 'XRP'}
  },
  {
    // SnapSwap USD market
    base: {currency: 'EUR', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
    counter: {currency: 'XRP'}
  },
  {
    // SnapSwap BTC market
    base: {currency:'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
    counter: {currency:'XRP'}
  },
  {
    // Justcoin BTC market
    base: {currency:'BTC', issuer: 'rJHygWcTLVpSXkowott6kzgZU6viQSVYM1'},
    counter: {currency:'XRP'}
  },
  {
    // Ripple Trade Japan JPY
    base: {currency:'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'},
    counter: {currency:'XRP'}
  },
  {
    // TokyoJPY JPY
    base: {currency:'JPY', issuer: 'r94s8px6kSw1uZ1MV98dhSRTvc6VMPoPcN'},
    counter: {currency:'XRP'}
  },
  {
    // Ripple Market Japan JPY
    base: {currency:'JPY', issuer: 'rJRi8WW24gt9X85PHAxfWNPCizMMhqUQwg'},
    counter: {currency:'XRP'}
  },
  {
    // Pax Moneta KRW
    base: {currency:'KRW', issuer: 'rUkMKjQitpgAM5WTGk79xpjT38DEJY283d'},
    counter: {currency:'XRP'}
  },
  {
    // Snapswap EUR/ Snapswap USD
    base    : {currency: 'EUR', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
    counter : {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}
  },
  {
    // Bitstamp BTC/USD
    base    : {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
    counter : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
  },
  {
    // Bitstamp BTC/USD
    base    : {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
    counter : {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
  },
  {
    // Bitstamp BTC/ Snapswap BTC
    base    : {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
    counter : {currency: 'BTC', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
  },
  {
    // Bitstamp USD/ Snapswap USD
    base    : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
    counter : {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
  },
  {
    // Bitstamp USD/ rippleCN CNY
    base    : {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'},
    counter : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
  },
  {
    // Bitstamp USD/ rippleChina CNY
    base    : {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'},
    counter : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
  },
  {
    //ripple trade japan JPY/ Bitstamp USD
    base    : {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'},
    counter : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
  },
  {
    //ripple trade japan JPY/ Snapswap USD/
    base    : {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'},
    counter : {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}
  },
  {
    //ripple trade japan JPY/ RippleCN CNY/
    base    : {currency: 'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'},
    counter : {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'}
  },
  {
    // Ripple Trade Japan JPY/TokyoJPY JPY
    base    : {currency:'JPY', issuer: 'rMAz5ZnK73nyNUL4foAvaxdreczCkG3vA6'},
    counter : {currency:'JPY', issuer: 'r94s8px6kSw1uZ1MV98dhSRTvc6VMPoPcN'}
  }
];

function tradeVolume(params, callback) {

  var rowkey;
  var ex;
  var startTime;
  var endTime;

  if (!params) params = {};
  ex        = params.ex || {currency:'XRP'};
  startTime = params.startTime;
  endTime   = params.endTime;
  rowkey    = ex.currency.toUpperCase() + '|' + (ex.issuer || '');

  if (!startTime && !endTime) {
    startTime = moment.utc().subtract(24, 'hours');
    endTime   = moment.utc();
    rowkey   += '|live';

  } else {
    rowkey += '|'+startTime.unix() + '|' + endTime.unix();
  }

  async.map(marketPairs, function(assetPair, asyncCallbackPair){

    var pair = {
      base    : assetPair.base,
      counter : assetPair.counter
    };

    //call offersExercised for each market pair
    offersExercised({
      base          : assetPair.base,
      counter       : assetPair.counter,
      startTime     : startTime,
      endTime       : endTime,
      timeIncrement : 'all'

    }, function (error, data) {

      if (error) return asyncCallbackPair(error);

      if (data && data.length > 1) {
        pair.rate   = data[1][8]; // vwavPrice
        pair.count  = data[1][3]; // num trades
        pair.amount = data[1][1]; // amount

      } else {
        pair.rate   = 0;
        pair.count  = 0;
        pair.amount = 0;
      }

      asyncCallbackPair(null, pair);
    });

  }, function(err, pairs) {
    if (err) {
      if (callback) callback(err);
      return;
    }

    var exchangeRate;
    var rates = { };
    var response = {
      startTime : startTime.format(),
      endTime   : endTime.format(),
      exchange  : ex,
    };

    //get rates vs XRP
    pairs.forEach(function(pair, index) {
      if (pair.counter.currency === 'XRP') {
        rates[pair.base.currency + "." + pair.base.issuer] = pair.rate;
      }
    });

    if (ex.currency == 'XRP') {
      exchangeRate = 1;
    } else if (rates[ex.currency + '.' + ex.issuer]) {
      exchangeRate = 1 / rates[ex.currency + '.' + ex.issuer];
    }

    //convert non - XRP to XRP value
    pairs.forEach(function(pair, index) {
      if (pair.counter.currency !== 'XRP') {
        pair.rate = rates[pair.base.currency + "." + pair.base.issuer];
      }
    })

    if (exchangeRate) finalize();
    else {
      getConversion({
        startTime : startTime,
        endTime   : endTime,
        currency  : ex.currency,
        issuer    : ex.issuer
      }, function(error, rate){
        if (error) return callback(error);
        exchangeRate = rate;
        finalize();
      });
    }

    function finalize () {
      var total = 0, count = 0;
      pairs.forEach(function(pair, index) {
        pair.rate            = pair.rate*exchangeRate;
        pair.convertedAmount = pair.amount*pair.rate;
        total += pair.convertedAmount;
        count += pair.count;
      });

      response.exchangeRate = exchangeRate;
      response.total        = total;
      response.count        = count;
      response.components   = pairs;

      cacheResponse (rowkey, response);

      if (callback) {
        callback(null, response);
      }
    }
  });
}

/**
 * get XRP to specified currency conversion
 */

function getConversion (params, callback) {

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
    else callback("cannot determine exchange rate");
  });
}

function cacheResponse (rowkey, response) {
  var table = 'agg_trade_volume';
  hbase.putRow(table, rowkey, response);
}


module.exports = tradeVolume;
