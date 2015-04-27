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

  if (currencies.length>15) return callback("Cannot retrieve more than 20 currencies");
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


  /*
   * retrieve data from couch according to specified options.
   *
   */
  function fromCouch (options, c, callback) {

    var viewOptions = options.subview ? options.subview : options.view;

    //if the start and end times are the same, there is no need to query couchDB
    if (viewOptions.startkey.toString()===viewOptions.endkey.toString()) {
      c.results = options.cached || [];
      return callback(null, c);
    }

    //Query CouchDB for changes in trustline balances
    db.view('currencyBalancesV2', 'v2', viewOptions, function(error, trustlineRes){

      if (error) return callback("CouchDB - " + error);

      if (!options.view.group_level) {
        c.amount = 0 - (trustlineRes.rows.length ? trustlineRes.rows[0].value : 0);

        if (c.hotwallets) {
          getHotWalletBalances(c, options, function(err, balances) {
            c.amount -= balances;
            callback (null, c);
          });
        } else {
          callback (null, c);
        }

        return;
      }

      //if there are cached results, we can get the start capitalization from there
      //NOTE: disrgarding this for now, might be contributing to bad results
      if (0 && options.cached && options.cached.length) {
        if (c.hotwallets) {
          getHotWalletBalances(c, options, function(err, balances) {
            if (err) {
              return callback(err);
            }

            startCapitalization = options.cached[options.cached.length-1][1];

            //a bit of a hack necessary so that the hot wallet is not subtracted twice
            var time = moment.utc(options.subview.startkey.slice(1)).format();
            if (balances[time]) {
              startCapitalization += balances[time];
            }

            c.results = prepareRows(options, startCapitalization, trustlineRes.rows, balances);
            return callback(null, c);
          });
        } else {
          startCapitalization = options.cached[options.cached.length-1][1];
          c.results = prepareRows(options, startCapitalization, trustlineRes.rows);
          return callback(null, c);
        }

      //otherwise, we need to get the reduced result from the begining of
      //time to the start of our range.
      } else {
        var initialValueViewOpts = {
          startkey      : [c.currency+"."+c.issuer],
          endkey        : viewOptions.startkey,
          inclusive_end : false,
          group         : false,
          stale         : "ok"
        };

        //query couchDB for the start capitalization
        db.view('currencyBalancesV2', 'v2', initialValueViewOpts, function(error, initValRes) {

          if (error) return callback("CouchDB - " + error);

          var startCapitalization = 0;
          if (initValRes && initValRes.rows && initValRes.rows.length > 0) {
            startCapitalization = 0 - initValRes.rows[0].value;
          }

          if (!viewOptions.group_level) {
            if (trustlineRes.rows.length) {
              c.amount = startCapitalization - trustlineRes.rows[0].value; //add inverted value
            }

            return callback(null, c);
          }

          //if we have hot wallets, we need to factor in their balances
          if (c.hotwallets) {
            getHotWalletBalances(c, options, function(err, balances) {
              if (err) {
                return callback(err);
              }
              c.results = prepareRows(options, startCapitalization, trustlineRes.rows, balances);
              return callback(null, c);
            });
          } else {
            c.results = prepareRows(options, startCapitalization, trustlineRes.rows);
            return callback(null, c);
          }
        });
      }
    });
  }


  /*
   * this function take the start capitalization, range results, cached results
   * and options to finalize a result.
   */
  function prepareRows (options, startCapitalization, rows, balances) {

    var viewOptions = options.subview ? options.subview : options.view;

    // Format and add startCapitalization data to each row
    // We will add a row for each increment that is missing
    // with the same amount as the previous increment, because
    // a missing row indicates no balance changes.
    if (rows) {
      var lastPeriodClose = startCapitalization;
      var time      = moment.utc(options.alignedTime);
      var firstTime = moment.utc(viewOptions.startkey.slice(1));
      var temp      = {};
      rows.forEach(function(row){
        temp[moment.utc(row.key.slice(1)).unix()] = row.value;
      });

      rows = [];

      rows.push([firstTime.format(), startCapitalization]);
      if (temp[time.unix()]) lastPeriodClose += (0-temp[time.unix()]);

      time.add(options.increment, 1); //skip the first

      //since we are getting the cumulative balance changes for each
      //interval, the value at each time is actually the final value
      //for the next time listed.  If there is not a result for the
      //time period, the value is unchanged.
      while (1) {
        if (lastPeriodClose < 0) lastPeriodClose = 0;

        //if we are past the end time, this is the value for the end time,
        //not the full interval past it.  Also we are finished.
        if (endTime.diff(time)<=0) {
          rows.push([endTime.format(), lastPeriodClose]);
          break;
        }

        //set the value for the current time as the previous cumulative total
        rows.push([time.format(), lastPeriodClose]);
        if (temp[time.unix()]) lastPeriodClose += (0-temp[time.unix()]);
        time.add(options.increment, 1); //forward 1 increment
      }

      if (balances) {
        var last = 0, final;
        rows.forEach(function(row, index) {
          if (balances[row[0]]) {
            last = balances[row[0]];
          }

          if (rows[index][1] > last) {
            rows[index][1] -= last;
          } else {
            rows[index][1] = 0;
          }
        });

        if (balances[time.format()]) {
          rows[rows.length-1][1] = lastPeriodClose - balances[time.format()];
        }
      }

      if (CACHE) {

        cacheResults(options, rows); //cache new results

        //get rid of the first row if it is a duplicate of
        //the first cached row, then combine the two
        if (options.cached && options.cached.length) {
          if (rows.length && rows[0][0]==options.cached[options.cached.length-1][0]) rows.shift();
          rows = options.cached.concat(rows);
        }
      }

    } else {
      winston.info("No results for currency:", util.inspect(c));
      rows = [];
    }

    return rows;
  }


  /*
   * check the cache for cached results that fit
   * the time range. If any are found, adjust the
   * view options accordingly.
   *
   */
  function getCached (options, callback) {

    //we dont cache completely reduced results
    if (options.view.reduce===false || !options.view.group_level) {
      return callback (null);
    }

    var keyBase  = parseKey(options.view);
    var time     = moment.utc(options.alignedTime);
    var end      = tools.getAlignedTime(endTime, options.increment);
    var cached   = [], keys = [];

    //skip the first unless it happens to be properly aligned
    if (time.diff(startTime)) time.add(options.increment, 1);

    //set up key list
    while(end.diff(time)>=0) {
      keys.push(keyBase+":"+time.unix());
      time.add(options.increment, 1);
    }

    //get cached points for the range
    redis.mget(keys, function(error, res){
      if (error)       return callback(error);
      if (!res.length) return callback();
      var last;

      for (var i=0; i<res.length; i++) {
        if (!res[i]) break; //missing data from this point
        row  = JSON.parse(res[i]);
        last = row[0];

        cached.push(row); //add to the list of cached results;
      }

      if (!last) return callback();   //no cached rows
      last = moment.utc(last);

      //adjust range of query to exclude cached results
      var key     = options.view.startkey.slice(0,1);
      var subview = JSON.parse(JSON.stringify(options.view)); //shallow copy

      subview.startkey    = key.concat(last.toArray().slice(0,6));
      options.subview     = subview;
      options.cached      = cached;
      options.alignedTime = last;
      options.startTime   = last;
      callback();
    });
  }

  /*
   * create the key used for the cache from the options
   */

  function parseKey(options) {
    return "CB:"+options.startkey[0]+":"+options.group_level;
  }

  /*
   * Save results into the cache for future use
   */

  function cacheResults(options, rows) {

    var keyBase = parseKey(options.view);
    var time    = moment.utc(options.alignedTime);
    var max     = moment.utc().subtract(45, 'minutes');
    var points  = [];

    //use the lesser of current time or endTime
    if (max.diff(endTime)>0) max = moment.utc(endTime);

    if (options.increment=="all") return; //ignore these
    if (options.view.reduce===false || !options.view.group_level) return; //ignore these too

    rows.forEach(function(row){
      var time    = moment.utc(row[0]);
      var aligned = tools.getAlignedTime(time, options.increment);
      var key     = keyBase+":"+time.unix();

      //exclude the ones that aren't aligned
      //this should be the first and last unless the
      //client aligned them properly beforehand
      if (time.diff(aligned)) return;
      if (time.diff(max) >= 0) return;

      points.push(key);
      points.push(JSON.stringify(row));
    });

    if (points.length) {
      redis.mset(points, function(error, res){
        if (error) return callback("Redis - " + error);
        if (DEBUG) winston.info(points.length/2 + " points cached");
      });
    }
  }

/**
 * getHotWalletBalances
 * @param {Object} c
 * @param {Object} options
 * @param {Object} callback
 */

  function getHotWalletBalances (c, options, callback) {
    var viewOptions = options.subview ? options.subview : options.view;
    var balances    = viewOptions.group_level ? {} : 0;

    async.map(c.hotwallets, function(account, asyncCallback) {
      var view = JSON.parse(JSON.stringify(viewOptions));
      var key  = c.currency + "." + account;
      var balance = 0, intitial;

      view.startkey[0] = key;
      view.endkey[0]   = key;

      var initialOpts = {
         startkey   : view.startkey,
         endkey     : [key],
         reduce     : false,
         limit      : 1,
         descending : true,
         stale      : 'ok'
      }

      db.view('currencyBalancesV2', 'v2', view, function(err, resp) {
        if (err) {
          return asyncCallback(err);
        }

        if (!view.group_level) {
          if (resp.rows.length) balances += resp.rows[0].value;
          return asyncCallback(null);
        }

        //get initial balance
        db.view('currencyBalancesV2', 'v2', initialOpts, function(err, initial) {
          if (err) {
            return asyncCallback(err);
          }

          if (initial.rows.length && initial.rows[0].value[0] === c.issuer) {
            balance = initial.rows[0].value[1];
          }

          var time = moment.utc(view.startkey.slice(1)).format();
          balances[time] = balances[time] ? balances[time] + balance : balance;

          resp.rows.forEach(function(row) {
            time = moment.utc(row.key.slice(1)).add(options.increment, 1).format();
            balance += row.value;
            if (balance > 0) {
              balances[time] = balances[time] ? balances[time] + balance : balance;
            }
          });

          asyncCallback(null);
        });
      });

    }, function(err, results) {

      return callback(err, balances);
    });
  }
}

module.exports = issuerCapitalization;
