var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  _         = require('lodash'),
  tools     = require('../utils');

var DEBUG = true;
var CACHE = false; //not implemented

if (process.argv.indexOf('debug')    !== -1) DEBUG = true;
if (process.argv.indexOf('no-cache') !== -1) CACHE = false; 

 
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
 *    startTime: (any momentjs-readable date), // required
 *    endTime: (any momentjs-readable date),   // required
 *    timeIncrement: (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    reduce: true/false, // optional, defaults to true, ignored if timeIncrement is set
 *    limit: optional, ignored unless reduce is false - limit the number of returned trades
 *    format: (either 'json', 'csv', or none) // optional - none returns an array of arrays
 *  }
 * 
 *  
  
  curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "trade" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Mar 11, 2014 5:34 am",
    "endTime"   : "Mar 11, 2014 12:12 pm",
    "timeIncrement" : "minute",
    "timeMultiple"  : 15
      
    }' http://localhost:5993/api/offersExercised
 
  
 */
function offersExercised (req, res) {
  var options  = {};
  options.view = {};
  
  if (DEBUG) var d,t = Date.now(); //tracking elapsed time
  
  parseOptions(); //parse request params for query options
  
  if (options.error) {
    winston.error(options.error);
    res.send(500, { error: options.error });
    return;
  }

  //console.log(options.view);
  
  if (CACHE) getCached(options.view, function(err, result){
    
    if (err) {
      winston.error('Cache Error: ' + err);
      res.send(500, { error: err });
      return;
    }
    
    options.cached = result.cached;
    options.view   = result.view;
    
    return fromCouch(); 
  });
  
  else fromCouch();




/*************** helper functions ****************/


/*
 * 
 * fromCouch - retrieve data from couch using the determined view
 * options saved in options.view.
 *  
 */
  function fromCouch() {
    if (DEBUG) d = Date.now();
    db.view("offersExercised", "v2", options.view, handleCouchResponse);
  }
  

/*
 * handleCouchResponse - process the response from the couch query
 *  
 */
  function handleCouchResponse (err, couchRes) {
    if (DEBUG) d = (Date.now()-d)/1000;

    if (err) {
      winston.error('Error with request: ' + err);
      res.send(500, { error: err });
      return;
    }
    
    var rows = [];
    
    // prepare results to send back
    if (options.view.reduce === false) {
      rows.push(['time','price','baseAmount','tradeAmount','tx_hash']);
      couchRes.rows.forEach(function(row){
        rows.push([
          moment.utc(row.value[3]).format(),
          row.value[2],//price
          row.value[1],//get amount
          row.value[0],//pay amount
          row.value[4],
        ]);  
      });
   
    } else {
      // data structure for grouping results 
      if (options.multiple > 1) rows = applyGroupMultiple(couchRes.rows); 
      else {
                
        couchRes.rows.forEach(function(row){
          //row.key will be null if this is reduced to a single row
          var startTime = row.key ? row.key.slice(2) : options.startTime;

          rows.push([
            moment.utc(startTime).format(), //start time
            row.value.curr2Volume,
            row.value.curr1Volume,
            row.value.numTrades,
            row.value.open,
            row.value.close,
            row.value.high,
            row.value.low,
            row.value.volumeWeightedAvg,
            moment.utc(row.value.openTime).format(),  //open  time
            moment.utc(row.value.closeTime).format(), //close time
          ]);
        });        
      }
      
      //prepend header row
      rows.unshift([
        'startTime', 'baseCurrVolume', 'tradeCurrVolume', 
        'numTrades', 'openPrice',      'closePrice', 
        'highPrice', 'lowPrice',       'vwavPrice',
        'openTime',  'closeTime',
      ]);
    }
    

    //cache results
    if (CACHE) {
      if (rows.length>1) cacheResults(rows);
      if (options.cached) rows = cached.concat(rows);
    }    
    
    handleResponse (rows); 
  }
  

/*
 * getCached - check the cache for existing data that overlaps
 * with this query.  If its found, return it and adjust the
 * view options accordingly.
 * 
 */  
  function getCached (options, callback) {
    callback (null, {view:options});
  }
  

/*
 * cacheResults - save the data returned from couch if it
 * is of a type we are caching.
 * 
 */  
  function cacheResults(rows) {
    
  }
  

/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (rows) {
    
    if (DEBUG) {
      t = (Date.now()-t)/1000;
      var interval = req.body.timeMultiple  ? req.body.timeMultiple  : "";
      interval    += req.body.timeIncrement ? req.body.timeIncrement : "";
    
      console.log("offersExercised - interval: "+interval, "database: "+d+"s","total: "+t+"s");
    }    
    

    if (req.body.format === 'csv') {

      var csvStr = _.map(rows, function(row){
        return row.join(', ');
      }).join('\n');

      // provide output as CSV
      res.end(csvStr);

    } else if (req.body.format === 'json') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().format(); 
      apiRes.startTime     = moment.utc(options.startTime).format();
      apiRes.endTime       = moment.utc(options.endTime).format();
      apiRes.base          = req.body.base;
      apiRes.trade         = req.body.trade;
      apiRes.interval      = options.increment || "all";
      if (options.multiple && options.multiple>1) apiRes.multiple = options.multiple;
      
      rows.shift();//get rid of header
      
      if (options.view.reduce === false) {
        apiRes.results = _.map(rows, function(row){
          return {
            time        : moment.utc(row[0]).format(),
            price       : row[1],
            baseAmount  : row[2],
            tradeAmount : row[3],
            tx_hash     : row[4]
          };
        });
        
      } else {
        
        
              
        apiRes.results = _.map(rows, function(row, index){
          return {
            startTime    : moment.utc(row[0]).format(),
            openTime     : moment.utc(row[10]).format(),
            closeTime    : moment.utc(row[9]).format(),
            baseCurrVol  : row[1],
            tradeCurrVol : row[2],
            numTrades    : row[3],
            openPrice    : row[4],
            closePrice   : row[5],
            highPrice    : row[6],
            lowPrice     : row[7],
            vwavPrice    : row[8]
          };
  
        });        
        
      }
      
      res.json(apiRes);

    } else {
      //no format or incorrect format specified
      res.send(rows);      
    }    
  }
 
  
/*
 * applyGroupMultiple - aggregate the the historical data according 
 * to the mulitple provided in the request.
 * 
 */  
  function applyGroupMultiple (rows) {
    
    // data structures for processing rows
    var tabledRowCount = 0, newElementCount = 0;
    var tabledRows     = [];
    var epochStartTime = moment.utc(options.startTime);
    var epochEndTime   = moment.utc(options.startTime);
    var results = [];
    
    // define the epoch for grouping of results
    epochEndTime.add(options.increment, options.multiple);

    // create initial row of table for assembling grouped results
    tabledRows[tabledRowCount] = [];

    rows.forEach(function(element, index, array) {

      var elementTime = moment.utc(element.value.openTime);

      // until element time is before or equal to epoch close time
      while (elementTime.diff(epochEndTime) > 0) {
        // set element time to be that of beginning of epoch
        element.value.epochTime = epochStartTime.format(DATEFORMAT);
  
        // increment epoch start & close time
        epochStartTime.add(options.increment, req.body.timeMultiple);
        epochEndTime.add(options.increment, req.body.timeMultiple);

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
    var groupedStartTime = 0, groupedOpenTime,        groupedCloseTime,
      groupedBaseCurrVolume,  groupedTradeCurrVolume, groupedNumTrades,       
      groupedOpenPrice,       groupedClosePrice,      groupedHighPrice,       
      groupedLowPrice,        groupedVwavPrice,        
      groupedVwavNumerator,   groupedVwavDenominator;
 
    tabledRows.forEach(function(element, index, array) {
  
      element.forEach(function(e, i, a) {

        // if this is first column
        if (i === 0) {
          // set initial values for each group
          groupedStartTime       = e.value.epochTime;
          groupedOpenPrice       = e.value.open;
          groupedOpenTime        = e.value.openTime;
          groupedClosePrice      = e.value.close;
          groupedCloseTime       = e.value.closeTime;
          groupedBaseCurrVolume  = 0;
          groupedTradeCurrVolume = 0;
          groupedNumTrades       = 0;
          groupedHighPrice       = 0;
          groupedLowPrice        = Number.MAX_VALUE;
          groupedVwavPrice       = 0;
          groupedVwavNumerator   = 0;
          groupedVwavDenominator = 0;
        }
        
        // SUM: base currency volume
        groupedBaseCurrVolume = parseFloat(groupedBaseCurrVolume) + parseFloat(e.value.curr2Volume);

        // SUM: trade currency volume
        groupedTradeCurrVolume = parseFloat(groupedTradeCurrVolume) + parseFloat(e.value.curr1Volume);

        // SUM: number trades
        groupedNumTrades = parseFloat(groupedNumTrades) + parseFloat(e.value.numTrades);

        // LAST: close price - assumes we are ordered by time
        groupedClosePrice = e.value.close;

        // LAST: close time - assumes we are ordered by time
        groupedCloseTime = e.value.closeTime;

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
      if (groupedStartTime !== 0) {
        // create grouped result based on processed group of rows
        results.push([
          groupedStartTime, 
          groupedBaseCurrVolume, 
          groupedTradeCurrVolume, 
          groupedNumTrades, 
          groupedOpenPrice, 
          groupedClosePrice, 
          groupedHighPrice, 
          groupedLowPrice, 
          groupedVwavPrice,
          moment.utc(groupedOpenTime).format(),
          moment.utc(groupedCloseTime).format()
        ]);
          
        groupedStartTime = 0;
      }
    });

    return results;      
  }

/*
 * parseOptions - parse request parameters to determine the view
 * options for the couch query.
 * 
 */
  function parseOptions () {
    
    if (!req.body.base || !req.body.trade) {
      options.error = 'please specify base and trade currencies';
      return;
    }
  
    // parse base currency details
    var base, trade;
    
    if (!req.body.base.currency) {
        options.error = 'please specify a base currency';
        return;
      
    } else if (!req.body.base.issuer) {
      
      if (req.body.base.currency.toUpperCase() === 'XRP') {
        options.base = ['XRP'];
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
      
    } else if (req.body.base.issuer && ripple.UInt160.is_valid(req.body.base.issuer)) {
      options.base = [req.body.base.currency.toUpperCase(), req.body.base.issuer];
      
    } else {
      var baseGatewayAddress = gatewayNameToAddress(req.body.base.issuer, req.body.base.currency.toUpperCase());
      if (baseGatewayAddress) {
        options.base = [req.body.base.currency.toUpperCase(), baseGatewayAddress];
        
      } else {
        options.error = 'invalid base currency issuer: ' + req.body.base.issuer;
        return;
      }
    }
  
    // parse trade currency details
    if (!req.body.base.currency) {
      options.error = 'please specify a base currency';
      return;
      
    } else if (!req.body.trade.issuer) {
      if (req.body.trade.currency.toUpperCase()  === 'XRP') {
        options.trade = ['XRP'];
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
    } else if (req.body.trade.issuer && ripple.UInt160.is_valid(req.body.trade.issuer)) {
      options.trade = [req.body.trade.currency.toUpperCase(), req.body.trade.issuer];
      
    } else {
      var tradeGatewayAddress = gatewayNameToAddress(req.body.trade.issuer, req.body.trade.currency.toUpperCase());
      if (tradeGatewayAddress) {
        options.trade = [req.body.trade.currency.toUpperCase(), tradeGatewayAddress];
        
      } else {
        options.error = 'invalid trade currency issuer: ' + req.body.trade.issuer;
        return;
      }
    }
    
  
    //Parse start and end times
    var time = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);
    
    if (time.error) {
      options.error = time.error;
      return;
    }
    
    if (!time.start || !time.end) {
      options.error = "startTime and endTime are required.";
    }
    
    options.startTime = time.start;
    options.endTime   = time.end;  
    
    
    //parse time increment and time multiple
    var results = tools.parseTimeIncrement(req.body.timeIncrement);  
    options.multiple = results.group_multiple;
    
    if (typeof req.body.timeMultiple === 'number') {
      options.multiple = options.multiple ? options.multiple*req.body.timeMultiple : req.body.timeMultiple;
    } else {
      options.multiple = 1;
    }

    if      (results.group_level===5) options.increment = "seconds";
    else if (results.group_level===4) options.increment = "minutes";
    else if (results.group_level===3) options.increment = "hours";
    else if (results.group_level===2) options.increment = "days";
    else if (results.group_level===1) options.increment = "months";
    else if (results.group_level===0) options.increment = "years";
      
    //set reduce option only if its false
    if (results.group_level)            options.view.group_level = results.group_level + 3;
    else if (req.body.reduce === false) options.view.reduce      = false;
  
    
    if (req.body.limit && typeof req.body.limit == "number") {
      options.view.limit = req.body.limit;
    }

  
    // set startkey and endkey for couchdb query
    options.view.startkey = [options.trade, options.base].concat(options.startTime.toArray().slice(0,6));
    options.view.endkey   = [options.trade, options.base].concat(options.endTime.toArray().slice(0,6));
    options.view.stale    = "ok"; //dont wait for updates  
    return options;      
  }
}

module.exports = offersExercised;
