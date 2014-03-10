var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  _         = require('lodash');
 
var DEBUG = false; 
/**
 *  offersExercised returns reduced or individual 
 *  trade-level data about trades that were executed
 *
 *  expects req.body to have:
 *  {
 *    base: {currency: "XRP"},
 *    trade: {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
 *    
 *    descending: true/false, // optional, defaults to true
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    reduce: true/false, // optional, defaults to true
 *    timeIncrement: (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    limit: optional, ignored unless reduce is false - limit the number of returned trades
 *    format: (either 'json', 'json_verbose', 'csv') // optional, defaults to 'json'
 *  }
 */

function offersExercised( req, res ) {
  var t = Date.now();//tracking elapsed time
  
  var viewOpts = {};

  //winston.info('req.body: ' + JSON.stringify(req.body));

  if (!req.body.base || !req.body.trade) {
    res.send(500, { error: 'please specify base and trade currencies' });
    return;
  }

  // parse base currency details
  var baseCurr;
  if (!req.body.base.currency) {
      res.send(500, { error: 'please specify a base currency'});
      return;
    
  } else if (!req.body.base.issuer) {
    
    if (req.body.base.currency.toUpperCase() === 'XRP') {
      baseCurr = ['XRP'];
    } else {
      res.send(500, { error: 'must specify issuer for all currencies other than XRP' });
      return;
    }
  } else if (req.body.base.issuer && ripple.UInt160.is_valid(req.body.base.issuer)) {
    baseCurr = [req.body.base.currency.toUpperCase(), req.body.base.issuer];
  } else {
    var baseGatewayAddress = gatewayNameToAddress(req.body.base.issuer, req.body.base.currency.toUpperCase());
    if (baseGatewayAddress) {
      baseCurr = [req.body.base.currency.toUpperCase(), baseGatewayAddress];
    } else {
      winston.error('invalid base currency issuer: ' + req.body.base.issuer);
      res.send(500, { error: 'invalid base currency issuer: ' + req.body.base.issuer });
      return;
    }
  }

  // parse trade currency details
  var tradeCurr;
  if (!req.body.base.currency) {
    res.send(500, { error: 'please specify a base currency'});
    return;
    
  } else if (!req.body.trade.issuer) {
    if (req.body.trade.currency.toUpperCase()  === 'XRP') {
      tradeCurr = ['XRP'];
    } else {
      res.send(500, { error: 'must specify issuer for all currencies other than XRP' });
      return;
    }
  } else if (req.body.trade.issuer && ripple.UInt160.is_valid(req.body.trade.issuer)) {
    tradeCurr = [req.body.trade.currency.toUpperCase(), req.body.trade.issuer];
  } else {
    var tradeGatewayAddress = gatewayNameToAddress(req.body.trade.issuer, req.body.trade.currency.toUpperCase());
    if (tradeGatewayAddress) {
      tradeCurr = [req.body.trade.currency.toUpperCase(), tradeGatewayAddress];
    } else {
      winston.error('invalid trade currency issuer: ' + req.body.trade.issuer);
      res.send(500, { error: 'invalid trade currency issuer: ' + req.body.trade.issuer });
      return;
    }
  }

  // parse startTime and endTime
  var startTime, endTime;

  if (!req.body.startTime && !req.body.endTime) {

    startTime = moment.utc().subtract('days', 30);
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

  // handle descending/non-descending query
  if (!req.body.hasOwnProperty('descending') || req.body.descending === true) {
    viewOpts.descending = true;

    // swap startTime and endTime if results will be in descending order
    var tempTime = startTime;
    startTime    = endTime;
    endTime      = tempTime;

  }

  // set reduce option
  if (!req.body.hasOwnProperty('reduce')) {
    viewOpts.reduce = true;
  } else {
    viewOpts.reduce = (req.body.reduce === true);
  }

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
    
  } else if (viewOpts.reduce !== false) {
    
    // TODO handle incorrect options better
    viewOpts.group = false; // default to day
  } else if (req.body.limit && typeof req.body.limit == "number") {
    //if reduce is true, limit the number of trades returned
    viewOpts.limit = req.body.limit;
  }

  
  // set startkey and endkey for couchdb query
  viewOpts.startkey = [tradeCurr, baseCurr].concat(startTime.toArray().slice(0,6));
  viewOpts.endkey   = [tradeCurr, baseCurr].concat(endTime.toArray().slice(0,6));
  viewOpts.stale    = "ok"; //dont wait for updates
  
  
  if (DEBUG) var d = Date.now();
  db.view("offersExercised", "v1", viewOpts, function(err, couchRes){

    if (DEBUG) d = (Date.now()-d)/1000;

    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }

    //winston.info('Got ' + couchRes.rows.length + ' rows');
    //winston.info(JSON.stringify(couchRes.rows));
    
    // prepare results to send back
    var resRows = [],
      headerRow = [
        'startTime', 
        'baseCurrVolume', 
        'tradeCurrVolume', 
        'numTrades', 
        'openPrice', 
        'closePrice', 
        'highPrice', 
        'lowPrice', 
        'vwavPrice'
      ];

    // data structure for grouping results 
    if ((req.body.timeMultiple) && (req.body.timeMultiple > 1)) {
      // data structures for processing rows
      var tabledRowCount = 0, newElementCount = 0;
      var tabledRows = [];
      var epochStartTime = moment.utc(startTime);
      var epochEndTime = moment.utc(startTime);

      // define the epoch for grouping of results
      epochEndTime.add(group_level_string, req.body.timeMultiple);

      // create initial row of table for assembling grouped results
      tabledRows[tabledRowCount] = [];

      couchRes.rows.forEach(function(element, index, array) {

        /*
        winston.info('Couch result Index: ' + index);
        winston.info(element.value.curr2Volume);
        winston.info(element.value.curr1Volume);
        winston.info(element.value.numTrades);
        winston.info(element.value.open);
        winston.info(element.value.close);
        winston.info(element.value.high);
        winston.info(element.value.low);
        winston.info(element.value.volumeWeightedAvg);
        */

        var elementTime = moment.utc(element.value.openTime);

        // until element time is before or equal to epoch close time
        while (elementTime.diff(epochEndTime) > 0) {
          // set element time to be that of beginning of epoch
          element.value.epochTime = epochStartTime.format(DATEFORMAT);
    
          // increment epoch start & close time
          epochStartTime.add(group_level_string, req.body.timeMultiple);
          epochEndTime.add(group_level_string, req.body.timeMultiple);

          // create a new row for every epoch
          tabledRowCount = tabledRowCount + 1;
          tabledRows[tabledRowCount] = [];

          // reset index for storage into new row
          newElementCount = 0;
        }

        // set element time to be that of beginning of epoch
        element.value.epochTime = epochStartTime.format(DATEFORMAT);

        // store row to be grouped
        tabledRows[tabledRowCount][newElementCount] = element;

        // increment variable used for counting and indexing row elements
        newElementCount = newElementCount + 1;
      });

      // data structures for grouping results 
      var groupedOpenTime = 0, groupedBaseCurrVolume, groupedTradeCurrVolume, groupedNumTrades,
          groupedOpenPrice, groupedClosePrice, groupedHighPrice, groupedLowPrice, groupedVwavPrice, groupedVwavNumerator, groupedVwavDenominator;
   
      tabledRows.forEach(function(element, index, array) {
        //winston.info('New row index: ' + index);

        element.forEach(function(e, i, a) {
          /*
          winston.info('column index: ' + i);
          winston.info(e);
          winston.info(e.value.curr2Volume);
          winston.info(e.value.curr1Volume);
          winston.info(e.value.numTrades);
          winston.info(e.value.open);
          winston.info(e.value.close);
          winston.info(e.value.high);
          winston.info(e.value.low);
          winston.info(e.value.volumeWeightedAvg);
          */

          // if this is first column
          if (i === 0) {
            // set initial values for each group
            groupedOpenPrice = e.value.open;
            groupedClosePrice = e.value.close;
            groupedBaseCurrVolume = 0;
            groupedTradeCurrVolume = 0;
            groupedNumTrades = 0;
            groupedHighPrice = 0;
            groupedLowPrice = Number.MAX_VALUE;
            groupedVwavPrice = 0;
            groupedVwavNumerator = 0;
            groupedVwavDenominator = 0;
          }
          // SUM: base currency volume
          groupedBaseCurrVolume = parseFloat(groupedBaseCurrVolume) + parseFloat(e.value.curr2Volume);

          // SUM: trade currency volume
          groupedTradeCurrVolume = parseFloat(groupedTradeCurrVolume) + parseFloat(e.value.curr1Volume);

          // SUM: number trades
          groupedNumTrades = parseFloat(groupedNumTrades) + parseFloat(e.value.numTrades);

          // LAST: close price
          groupedClosePrice = e.value.close;

          // LAST: open time
          // set element time to be that of beginning of epoch (resolves RC-56)
          groupedOpenTime = e.value.epochTime;

          // MAX: high price
          groupedHighPrice = Math.max(groupedHighPrice, parseFloat(e.value.high));

          // MIN: low price
          groupedLowPrice = Math.min(groupedLowPrice, parseFloat(e.value.low));

          // regenerate volume weighted average price numerator, defined as sum of trade volume multiplied by VWAP
          groupedVwavNumerator = groupedVwavNumerator + e.value.volumeWeightedAvg * e.value.curr1Volume;

          // regenerate volume weighted average price denominator, defined as sum of trade volume
          groupedVwavDenominator = groupedVwavDenominator + e.value.curr1Volume;
        });

        // regenerate volume weighted average price statistics over entire group
        if (groupedVwavDenominator === 0) {
          // don't divide by zero, set result to zero if denominator value is zero
          groupedVwavPrice = 0;
        } else {
          // recalculate volume weighted average price over entire group
          groupedVwavPrice = groupedVwavNumerator / groupedVwavDenominator;
        }

        // don't include empty rows
        if (groupedOpenTime !== 0) {
          // create grouped result based on processed group of rows
          resRows.push([groupedOpenTime, groupedBaseCurrVolume, groupedTradeCurrVolume, groupedNumTrades, groupedOpenPrice, groupedClosePrice, groupedHighPrice, groupedLowPrice, groupedVwavPrice]);
          groupedOpenTime = 0;
        }
      });

      // add header row to results
      resRows.unshift(headerRow);
      
    } else if (viewOpts.reduce === true) {
      
      resRows.push(headerRow);

      couchRes.rows.forEach(function(row){

        resRows.push([
          (row.key ? moment.utc(row.key.slice(2)).format(DATEFORMAT) : moment.utc(row.value.openTime).format(DATEFORMAT)),
          row.value.curr2Volume,
          row.value.curr1Volume,
          row.value.numTrades,
          row.value.open,
          row.value.close,
          row.value.high,
          row.value.low,
          row.value.volumeWeightedAvg
          ]);
      });
      
    } else {      
      couchRes.rows.forEach(function(row){
        resRows.push(JSON.stringify(row));
      });
    }
    

    if (DEBUG) {
      t = (Date.now()-t)/1000;
      var interval = req.body.timeMultiple  ? req.body.timeMultiple  : "";
      interval    += req.body.timeIncrement ? req.body.timeIncrement : "";
    
      console.log("interval: "+interval, "database: "+d+"s","total: "+t+"s");
    }
    
    // handle format option
    if (!req.body.format || req.body.format === 'json') {

      // TODO include time sent?
      res.send(resRows);

    } else if (req.body.format === 'csv') {

      var csvStr = _.map(resRows, function(row){
        return row.join(', ');
      }).join('\n');

      // provide output as CSV
      res.end(csvStr);

    } else if (req.body.format === 'json_verbose') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().valueOf();

      apiRes.rows = _.map(resRows, function(row){

        // reformat rows
        return {
          openTime: (row.key ? moment.utc(row.key.slice(2)).format(DATEFORMAT) : moment.utc(row.value.openTime).format(DATEFORMAT)),
          baseCurrVol: row.value.curr2Volume,
          tradeCurrVol: row.value.curr1Volume,
          numTrades: row.value.numTrades,
          openPrice: row.value.open,
          closePrice: row.value.close,
          highPrice: row.value.high,
          lowPrice: row.value.low,
          vwavPrice: row.value.volumeWeightedAvg
        };

      });

      res.json(apiRes);

    } else {
      // TODO handle incorrect input
      winston.error('incorrect format: ' + req.body.format);

    }

  });

}

module.exports = offersExercised;