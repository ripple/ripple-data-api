var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  _         = require('lodash'),
  async     = require('async'),
  Q         = require('q');

/**
 *  topMarkets: 
 * 
 *  the total trading volume for the top 5 markets on the ripple network 
 *  for a given time period, normalized USD. Returns data for the last 24 hours 
 *  if no arguments are given.
 *
 *  request : {
 *   
 *    startTime : (any momentjs-readable date), // optional,  defaults to 1 day ago if endTime is absent
 *    endTime   : (any momentjs-readable date), // optional,  defaults to now if startTime is absent
 *  }
 * 
 * 
 *  response : [
 * 
 *   ['startTime','baseCurrVolume','finalCoversionRate','marketValue'], //header row
 *    ... //one row for each of the top 5 markets
 *  ]
 * 
 */

function topMarkets( req, res ) {
 
  var viewOpts = {};

  var marketPairs = [
    {
      // Bitstamp USD market
      base: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      trade: {currency: 'XRP'}
    },
    {
      // Bitstamp BTC market
      base: {currency: 'BTC', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
      trade: {currency: 'XRP'}
    },
    {
      // RippleCN CNY market
      base: {currency: 'CNY', issuer: 'rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK'},
      trade: {currency: 'XRP'}
    },
    {
      // RippleChina CNY market
      base: {currency: 'CNY', issuer: 'razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA'},
      trade: {currency: 'XRP'}
    },
    {
      // SnapSwap USD market
      base: {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'},
      trade: {currency: 'XRP'}
    }
  ];


  var conversionPairs = [
    {
      // Bitstamp USD value of XRP
      base: {currency: 'XRP'},
      trade: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      // Bitstamp USD value of XRP
      base: {currency: 'XRP'},
      trade: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      // RippleCN USD value of XRP does not exist; use Bitstamp conversion rate
      base: {currency: 'XRP'},
      trade: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      // RippleChina USD value of XRP does not exist; use Bitstamp conversion rate
      base: {currency: 'XRP'},
      trade: {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'}
    },
    {
      // SnapSwap USD value of XRP
      base: {currency: 'XRP'},
      trade: {currency: 'USD', issuer: 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q'}
    }
  ];

  // parse startTime and endTime
  var startTime, endTime;

  if (!req.body.startTime && !req.body.endTime) {

    startTime = moment.utc().subtract('hours', 24);
    endTime = moment.utc();

  } else if (req.body.startTime && req.body.endTime && moment(req.body.startTime).isValid() && moment(req.body.endTime).isValid()) {

    if (moment(req.body.startTime).isBefore(moment(req.body.endTime))) {
      startTime = moment.utc(req.body.startTime);
      endTime = moment.utc(req.body.endTime);
    } else {
      endTime = moment.utc(req.body.startTime);
      startTime = moment.utc(req.body.endTime);
    }

  } else {

    if (!req.body.startTime && req.body.endTime) {
      winston.error('invalid startTime: ' + req.body.startTime);
      res.send(500, { error: 'invalid startTime: ' + req.body.startTime });
    }

    if (!moment(req.body.startTime).isValid()) {
      winston.error('invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt());
      res.send(500, { error: 'invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt() });
    }

    if (!req.body.endTime && req.body.startTime) {
      winston.error('invalid endTime: ' + req.body.endTime);
      res.send(500, { error: 'invalid endTime: ' + req.body.endTime });
    }

    if (!moment(req.body.endTime).isValid()) {
      winston.error('invalid endTime: ' + req.body.endTime + ' is invalid at: ' + moment(req.body.endTime).invalidAt());
      res.send(500, { error: 'invalid endTime: ' + req.body.endTime + ' is invalid at: ' + moment(req.body.endTime).invalidAt() });
    }

    return;
  }


  if (endTime.isBefore(startTime)) { //swap times
    tempTime  = startTime;
    startTime = endTime;
    endTime   = tempTime;
  } else if (endTime.isSame(startTime)) {
    return res.send(500, { error: 'please provide 2 distinct times'});
  }
  
/*
  // handle descending/non-descending query
  if (!req.body.hasOwnProperty('descending') || req.body.descending === true) {
    viewOpts.descending = true;

    // swap startTime and endTime if results will be in descending order
    var tempTime = startTime;
    startTime = endTime;
    endTime = tempTime;
  }

  // set reduce option
  if (!req.body.hasOwnProperty('reduce')) {
    viewOpts.reduce = true;
  } else {
    viewOpts.reduce = (req.body.reduce === true);
  }
*/

  // prepare results to send back
  var resRows = [],
    headerRow = [
      'startTime', 
      'baseCurrVolume', 
      'finalConversionRate',
      'marketValue'
    ];

  // data structure for grouping results 
  var orderedRows = [], finalRows = [], finalRates = [], toXrpRateResults = [], toUsdRateResults = [];

  // Mimic calling offersExercised for each asset pair
  async.mapLimit(marketPairs, 10, function(assetPair, asyncCallbackPair){

    require("./offersExercised")({
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

    results.forEach(function(result) {
      //winston.info("XRP Rate: " + JSON.stringify(result.rate));

      toXrpRateResults.push(result.rate);
    });
  });

  // Mimic calling offersExercised for each XRP to USD pair
  async.mapLimit(conversionPairs, 10, function(assetPair, asyncCallbackPair){

    require("./offersExercised")({
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

    results.forEach(function(result) {
      //winston.info("USD Rate: " + JSON.stringify(result.rate));

      toUsdRateResults.push(result.rate);
    });

    toXrpRateResults.forEach(function(element, index, array) {
      if ((marketPairs[index]) && (marketPairs[index].base)) {
        if (marketPairs[index].base.currency === 'USD') {
          // use 1.0000 for USD since USD->XRP->USD is never quite 1.0000
          finalRates.push(1.0);
        } else {
          finalRates.push(element * toUsdRateResults[index]);
        }
      }
    });
  });

  // determine the group_multiple from the timeMultiple field
  if (viewOpts.reduce === true && req.body.timeMultiple) {
    viewOpts.group_multiple = req.body.timeMultiple;
  } else {
    viewOpts.group_multiple = 1;  // default to no multiple of time increment
  }

  var group_level_string;

  // gather custom time period data used later for grouping
  if (viewOpts.reduce === true && req.body.timeIncrement) {
    // determine the group_level from the timeIncrement field
    var inc = req.body.timeIncrement.toLowerCase().slice(0, 2),
      levels = ['ye', 'mo', 'da', 'ho', 'mi', 'se']; // shortened to accept 'yearly' or 'min' as well as 'year' and 'minute'
    if (inc === 'al') {
      viewOpts.group = false;
    } else if (inc === 'no') {
      viewOpts.reduce = false;
    } else if (inc === 'we') {
      viewOpts.group_multiple = viewOpts.group_multiple * 7; // multiply by days in a week
      viewOpts.group_level = 3 + 2; // set group_level to day
      group_level_string = 'weeks';
    } else if (levels.indexOf(inc)) {
      viewOpts.group_level = 3 + levels.indexOf(inc);
      switch (inc) {
        case 'ye': 
          group_level_string = 'years';
          break;
        case 'mo': 
          group_level_string = 'months';
          break;
        case 'da': 
          group_level_string = 'days';
          break;
        case 'ho': 
          group_level_string = 'hours';
          break;
        case 'mi': 
          group_level_string = 'minutes';
          break;
        case 'se': 
          group_level_string = 'seconds';
          break;
      }
    } else {
      viewOpts.group_level = 3 + 2; // default to day
    } 
  } else {
    // TODO handle incorrect options better
    viewOpts.group = false; // default to day
  }

  var getPairValue = function(marketPair, viewOpts) {
    var deferred = Q.defer();


    if (marketPair.trade) {
      if (marketPair.trade.currency === 'XRP') {
        tradeCurr = [marketPair.trade.currency];
      } else {
        tradeCurr = [marketPair.trade.currency, marketPair.trade.issuer];
      }
    } else {
      tradeCurr = ['XRP'];
    }

    if (marketPair.base) {
      if (marketPair.base.currency === 'XRP') {
        baseCurr = [marketPair.base.currency];
      } else {
        baseCurr = [marketPair.base.currency, marketPair.base.issuer];
      }
    } else {
      baseCurr = ['XRP'];
    }

    // set startkey and endkey for couchdb query
    viewOpts.startkey = [tradeCurr, baseCurr].concat(startTime.toArray().slice(0,6));
    viewOpts.endkey = [tradeCurr, baseCurr].concat(endTime.toArray().slice(0,6));

    // query the couch db offersExercised map-reduce view
    db.view("offersExercised", "v1", viewOpts, function(err, couchRes){
      if (err) {
        winston.error('Error with request: ' + err);
        deferred.reject(new Error(err));
      } else {
        deferred.resolve(couchRes.rows);
      }
    });
    return deferred.promise;
  };

  // align calls to couch such that our returns are synchronous
  Q.all([
    getPairValue(marketPairs[0], viewOpts),
    getPairValue(marketPairs[1], viewOpts),
    getPairValue(marketPairs[2], viewOpts),
    getPairValue(marketPairs[3], viewOpts),
    getPairValue(marketPairs[4], viewOpts)
  ]).spread(function(pZero, pOne, pTwo, pThree, pFour) {

    // assemble sequential couch results into ordered array
    resRows.push(pZero);
    resRows.push(pOne);
    resRows.push(pTwo);
    resRows.push(pThree);
    resRows.push(pFour);

    // create rows with time, volume, base-to-USD conversion rate, & market cap in USD
    resRows.forEach(function(row, index, array) {
      for (var key in row) {
        if (row.hasOwnProperty(key)) {
          //winston.info(row[key].value.curr2Volume + " * " + finalRates[index] + " = " + row[key].value.curr2Volume*finalRates[index]);

          // multiply base currency volume by the final conversion rate to create volume in USD
          orderedRows.push([moment.utc(row[key].value.openTime).format(DATEFORMAT),
                          row[key].value.curr2Volume, finalRates[index], 
                          row[key].value.curr2Volume*finalRates[index]]);
        }
      }
    });

    // time multiples for topMarkets currently untested
    if ((req.body.timeMultiple) && (req.body.timeMultiple > 1)) {
      // data structures for processing rows
      var tabledRowCount = 0, newElementCount = 0;
      var tabledRows = [];
      var epochStartTime = moment(startTime);
      var epochEndTime = moment(startTime);

      // define the epoch for grouping of results
      epochEndTime.add(group_level_string, req.body.timeMultiple);

      // create initial row of table for assembling grouped results
      tabledRows[tabledRowCount] = [];

      orderedRes.rows.forEach(function(element, index, array) {

        var elementTime = moment(element.value.openTime);

        if (elementTime > epochEndTime) {
          epochStartTime.add(group_level_string, req.body.timeMultiple);
          epochEndTime.add(group_level_string, req.body.timeMultiple);

          // if this is not the first row processed
          if (index !== 0) {
            // increment variable used for counting and indexing rows in table
            tabledRowCount = tabledRowCount + 1;
          }

          // create a new row if at boundary
          tabledRows[tabledRowCount] = [];

          // reset index for storage into new row
          newElementCount = 0;
        }

        // store row to be grouped
        tabledRows[tabledRowCount][newElementCount] = element;

        // increment variable used for counting and indexing row elements
        newElementCount = newElementCount + 1;
      });

      // data structures for grouping results 
      var groupedRows = [];
      var groupedOpenTime, groupedBaseCurrVolume;
   
      tabledRows.forEach(function(element, index, array) {

        element.forEach(function(e, i, a) {

          // if this is first column
          if (i === 0) {
            // set initial values for each group
            groupedBaseCurrVolume = 0;
          }
          // SUM: base currency volume
          groupedBaseCurrVolume = parseFloat(groupedBaseCurrVolume) + parseFloat(e.value.curr2Volume);
        });

        // create grouped result based on processed group of rows
        groupedRows.push([groupedOpenTime, groupedBaseCurrVolume]);

        // add header row to results
        groupedRows.unshift(headerRow);

        // use grouped rows as our final rows
        finalRows = groupedRows;
      });
    } else {
      // use original results as our final rows
      finalRows = orderedRows;
    }

    // add header row to results
    finalRows.unshift(headerRow);

    // handle format option
    if (!req.body.format || req.body.format === 'json') {

      // send to client
      res.send(finalRows); 

    } else if (req.body.format === 'csv') {

      var csvStr = _.map(finalRows, function(row){
        return row.join(', ');
      }).join('\n');

      // provide output as CSV
      res.end(csvStr);

    } else if (req.body.format === 'json_verbose') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().valueOf();

      apiRes.rows = _.map(finalRows, function(row){

        // reformat rows
        return {
          openTime: (row.key ? moment.utc(row.key.slice(2)).format(DATEFORMAT) : moment.utc(row.value.openTime).format(DATEFORMAT)),
          baseCurrVol: row.value.curr2Volume
        };

      });

      res.json(apiRes);

    } else {
      // TODO handle incorrect input
      winston.error('incorrect format: ' + req.body.format);

    }
  }); 
}


module.exports = topMarkets;