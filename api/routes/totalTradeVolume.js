var winston     = require('winston');
var moment      = require('moment');
var ripple      = require('ripple-lib');
var async       = require('async');
var tradeVolume = require('../library/metrics/tradeVolume');

/**
 *  topMarkets:
 *
 *  the total trading volume for the top markets on the ripple network
 *  for a given time period, normalized USD. Returns data for the last 24 hours
 *  if no arguments are given.
 *
 * request:
 *
 * {
 *    startTime : (any momentjs-readable date), // optional, defaults to 1 day before end time
 *    endTime   : (any momentjs-readable date), // optional, defaults to now
 *    exchange  : {                             // optional, defaults to XRP
 *      currency  : (XRP, USD, BTC, etc.),
 *      issuer    : "rAusZ...."                 // optional, required if currency != XRP
 *    }
 *  }
 *
 * response:
 *
 * {
 *    startTime    : '2014-03-13T20:26:24+00:00',   //period start
 *    endTime      : '2014-03-14T20:26:24+00:00',   //period end
 *    exchange     : { currency: 'XRP' },           //requested exchange currency
 *    exchangeRate : 1,                             //XRP exchange rate of requested currency
 *    total        : 1431068.4284775178,            //total volume in requested currency
 *    count        : 627,                           //number of trades
 *    components   : [                              //list of component markets
 *      {
 *        base            : {"currency":"USD","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
 *        counter         : {"currency":"XRP"},
 *        rate            : 69.9309953931345,
 *        count           : 99,
 *        amount          : 3107.9273091242917,
 *        convertedAmount : 217340.45033656774
 *      },
 *      .
 *      .
 *      .
 *    ]
 * }
 *
 *
 *
   curl -H "Content-Type: application/json" -X POST -d '{

    }' http://localhost:5993/api/topMarkets


   curl -H "Content-Type: application/json" -X POST -d '{
    "exchange"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "2014-10-30 01:00 pm",
    "endTime" : "2014-10-30 05:00 pm"

    }' http://localhost:5993/api/topMarkets

 */

function topMarkets(params, callback) {

  var viewOpts = {};
  var ex       = params.exchange || {currency:'XRP'};
  var rowkey;
  var startTime;
  var endTime;

  if (typeof ex != 'object') {
    return callback('invalid exchange currency');

  } else if (!ex.currency) {
    return callback('exchange currency is required');

  } else if (typeof ex.currency != 'string') {
    return callback('invalid exchange currency');

  } else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer) {
    return callback('exchange issuer is required');

  } else if (ex.currency == "XRP" && ex.issuer) {
    return callback('XRP cannot have an issuer');
  }

  rowkey = ex.currency.toUpperCase() + '|' + (ex.issuer || '');

  if (!params.startTime && !params.endTime) {
    startTime = moment.utc().subtract('hours', 24);
    endTime   = moment.utc();
    rowkey   += '|live';

  } else {
      if (params.startTime &&
        params.endTime &&
        moment(params.startTime).isValid() &&
        moment(params.endTime).isValid()) {

      if (moment(params.startTime).isBefore(moment(params.endTime))) {
        startTime = moment.utc(params.startTime);
        endTime   = moment.utc(params.endTime);

      } else {
        endTime   = moment.utc(params.startTime);
        startTime = moment.utc(params.endTime);
      }

    } else if (params.endTime && moment(params.endTime).isValid()) {
      endTime   = moment.utc(params.endTime);
      startTime = moment.utc(params.endTime).subtract('hours', 24);

    } else if (params.startTime) {
      if (!moment(params.startTime).isValid()) {
        return callback('invalid startTime: ' + params.startTime + ' is invalid at: ' + moment(params.startTime).invalidAt());
      }

      if (!moment(params.endTime).isValid()) {
        return callback('invalid endTime: ' + params.endTime + ' is invalid at: ' + moment(params.endTime).invalidAt());
      }

      return callback("invalid time"); //should never get here
    }

    rowkey += '|'+startTime.unix() + '|' + endTime.unix();
  }

  if (endTime.isBefore(startTime)) { //swap times
    tempTime  = startTime;
    startTime = endTime;
    endTime   = tempTime;

  } else if (endTime.isSame(startTime)) {
    return callback('please provide 2 distinct times');
  }

  hbase.getRow('agg_trade_volume', rowkey, function(err, row) {
    if (row) {
      row.components   = JSON.parse(row.components);
      row.exchange     = JSON.parse(row.exchange);
      row.total        = parseFloat(row.total);
      row.count        = parseFloat(row.count);
      row.exchangeRate = parseFloat(row.exchangeRate);
    }

    if (!err && !row && rowkey.indexOf('live') === -1) {
      tradeVolume({startTime:startTime, endTime:endTime, ex:ex}, callback);
    } else {
      callback(err, row);
    }
  });

  /*
  if (CACHE) {
    rowkey = "TM:" + ex.currency;
    if (ex.issuer) rowkey += "."+ex.issuer;
    rowkey += ":hist:"+startTime.unix()+":"+endTime.unix();


    redis.get(rowkey, function(error, response){
      if (error)                      return callback("Redis - " + error);
      if (response && params.history) return callback(null, true);
      else if (response)              return callback(null, JSON.parse(response));
      else tradeVolume({startTime:startTime, endTime:endTime, ex:ex}, callback);
    });

  } else tradeVolume({startTime:startTime, endTime:endTime, ex:ex}, callback);

  8/
/*
  function fromCouch() {
    //prepare results to send back
    var response = {
      startTime : startTime.format(),
      endTime   : endTime.format(),
      exchange  : ex,
    };


    // Mimic calling offersExercised for each market pair
    async.map(marketPairs, function(assetPair, asyncCallbackPair){

      require("./offersExercised")({
        base          : assetPair.base,
        counter       : assetPair.counter,
        startTime     : startTime,
        endTime       : endTime,
        timeIncrement : 'all'

      }, function (error, data) {

        if (error) return asyncCallbackPair(error);

        if (data && data.length > 1) {
          assetPair.rate   = data[1][8]; // vwavPrice
          assetPair.count  = data[1][3]; // num trades
          assetPair.amount = data[1][1]; // amount
        } else {
          assetPair.rate   = 0;
          assetPair.count  = 0;
          assetPair.amount = 0;
        }
        asyncCallbackPair(null, assetPair);

      });

    }, function(error, pairs) {
      if (error) return callback(error);

      var exchangeRate;
      var rates = { };

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

        if (CACHE) {
          cacheResponse (rowkey, response);
        }

        if (params.history) callback(null, false);
        else callback(null, response);
      }
    });
  }
*/

  /*
   * get XRP to specified currency conversion
   */

  function convert (ex, data, callback) {

    // Mimic calling offersExercised
    require("./offersExercised")({
      base      : {currency:"XRP"},
      counter   : ex,
      startTime : moment.utc().subtract(24, 'hours'),
      endTime   : moment.utc(),
      timeIncrement : 'all'

    }, function(err, resp) {
      var rate;

      if (err) {
        callback(err);
      } else if (!resp || !resp.length || resp.length<2) {
        callback("cannot determine exchange rate");
      } else {
        rate = resp[1][8]; // vwavPrice

        data.components.forEach(function(pair, index) {
          pair.rate            *= rate;
          pair.convertedAmount  = pair.amount*pair.rate;
        });

        data.exchange     = ex;
        data.exchangeRate = rate;
        data.total       *= rate;
        callback(null, data);
      }
    });
  }
}
module.exports = topMarkets;
