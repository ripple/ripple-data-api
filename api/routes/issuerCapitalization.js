var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  async     = require('async'),
  util      = require('util'),
  tools     = require('../utils');

/**
 *  issuerCapitalization returns the total capitalization (outstanding balance)
 *  of a specified issuer & specified currency pair, over the given time range.
 *
 *  Available options are:
 *  {
 *    currencies: [
 *      {
 *        issuer: ('Bitstamp' or 'rvY...'),
 *        currency: ('USD', 'BTC', etc)
 *      },{
 *        issuer: ('Bitstamp' or 'rvY...'),
 *        currency: ('USD', 'BTC', etc)
 *      },
 *            .
 *            .
 *            .
 *
 *
 *    // the following options are optional
 *    // by default it will return the gateway's current balance
 *
 *    startTime     : (any momentjs-readable date),
 *    endTime       : (any momentjs-readable date),
 *    timeIncrement : (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // defaults to 'all'
 *  }
 *
 *

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "June 26, 2014 10:00 am",
      "endTime"   : "June 30, 2014 10:47 am",
      "currencies" : [{"currency"  : "BTC", "issuer": "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q"}],
      "timeIncrement" : "hour"

    }' http://localhost:5993/api/issuer_capitalization

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Mar 5, 2011 10:00 am",
      "endTime"   : "Mar 6, 2015 10:47 am",
      "currencies" : [{"currency"  : "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}],
      "timeIncrement" : "month"

    }' http://localhost:5993/api/issuer_capitalization

   curl -H "Content-Type: application/json" -X POST -d '{
      "currencies" : [{"currency"  : "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}]

    }' http://localhost:5993/api/issuer_capitalization

 */


function issuerCapitalization(params, callback) {

  var error,
    maxLimit   = 500,
    currencies = [];

  //validate incoming currencies
  if (Array.isArray(params.currencies)) {

    params.currencies.forEach(function(c){

      if (c.issuer) {
        c.name       = tools.getGatewayName(c.issuer);
        c.hotwallets = tools.getHotWalletsForGateway(c.name);
        currencies.push(c);

      } else {
        error = 'issuer is required: '+JSON.stringify(c);
        return;
      }
    });

    if (error) return callback(error);

  } else return callback('please specify at least one issuer-currency pair');

  if (currencies.length>25) return callback("Cannot retrieve more than 25 currencies");
  if (!params.startTime) params.startTime = "Jan 1 2013 12:00+0:00";

  //Parse start and end times
  var time = tools.parseTimeRange(params.startTime, params.endTime, params.descending);

  if (time.error) {
    callback(time.error);
    return;
  }

  var startTime = time.start;
  var endTime   = time.end;



  // get capitalization data for each currency
  async.map(currencies, function(c, asyncCallbackPair) {

    var options = {
      currency: c.currency,
      issuer: c.issuer,
      start: startTime,
      end: endTime,
      descending: false,
      adjusted: true
    };

    if (!params.timeIncrement) {
      options.limit = 1;
      options.descending = true;
    } else {
      options.interval = params.timeIncrement;
      options.descending = false;
    }

    hbase.getCapitalization(options, function(err, resp) {
      if (err) {
        asyncCallbackPair(err);
        return;
      }

      resp.rows.forEach(function(row, i) {
        resp.rows[i] = [
          row.date,
          row.amount
        ];
      });

      asyncCallbackPair(null, {
        currency: c.currency,
        issuer: c.issuer,
        results: resp.rows
      });
    });

  }, function(error, results){
    if (error) return callback(error);

    return callback(null, results); //final results from API call
  });
}

module.exports = issuerCapitalization;
