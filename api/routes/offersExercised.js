var winston = require('winston'),
  moment    = require('moment'),
  ripple    = require('ripple-lib'),
  _         = require('lodash'),
  tools     = require('../utils');

/**
 *  offersExercised returns reduced or individual 
 *  trade-level data about trades that were executed
 *
 *  expects params to have:
 *  {
 *    base: {currency: "XRP"},
 *    counter: {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
 *    
 *    descending: true/false, // optional, defaults to true
 *    startTime: (any momentjs-readable date), // required
 *    endTime: (any momentjs-readable date),   // required
 *    timeIncrement: (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    reduce: true/false, // optional, defaults to true, ignored if timeIncrement is set
 *    limit: optional, ignored unless reduce is false - limit the number of returned trades
 *    offset: optional, offset results by n transactions
 *    format: (either 'json', 'csv', or none) // optional - none returns an array of arrays
 *  }
 * 
 *  
  
  curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "counter" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Mar 04, 2014 9:00 am z",
    "endTime"   : "Apr 05, 2014 10:45 am z",
    "timeIncrement" : "minute",
    "format"        : "csv"
      
    }' http://localhost:5993/api/offersExercised
    

  curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "counter" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Mar 10, 2014 4:35 am",
    "endTime"   : "Mar 11, 2014 5:10:30 am",
    "timeIncrement" : "minute",
    "timeMultiple"  : 15,
    "format" : "json"
      
    }' http://localhost:5993/api/offersExercised    
 
 
  curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "XRP"},
    "counter" : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "startTime" : "Mar 11, 2014 4:44:00 am",
    "endTime"   : "Mar 12, 2014 5:09:00 am",
    "timeIncrement" : "hour",
    "timeMultiple"  : 4,
    "format"  : "csv"
      
    }' http://localhost:5993/api/offersExercised
 
  curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "BTC", "issuer" : "rNPRNzBB92BVpAhhZr4iXDTveCgV5Pofm9"},
    "counter" : {"currency": "XRP"},
    "startTime" : "Apr 7, 2014 4:44:00 am",
    "endTime"   : "Apr 11, 2014 5:09:00 am",
    "reduce"    : false,
    "limit"     : 10,
    "format"    : "csv",
    "descending": true
    
    }' http://localhost:5993/api/offersExercised    
    
 */

function offersExercised (params, callback, unlimit) {
  var options  = {};
  options.view = {};
  
  parseOptions(); //parse request params for query options
  
  if (options.error) return callback (options.error);

  //console.log(options.view);
  
  if (CACHE) getCached(function(error, result){
    
    if (error) return callback ('Redis - ' + error);

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
  
    var view = options.subview ? options.subview : options.view;
    
    //if the start and end times are the same, there is no need to query couchDB
    if (view.startkey.toString()===view.endkey.toString()) {
      return handleResponse (options.cached || []); 
    }
    
    //if the start key and end key are the same, we wont get
    //any results, so just pass along an empty result
    if (view.startkey==view.endkey) {
      return handleCouchResponse(null, {rows:[]}); 
    } else {

      db.view("offersExercisedV2", "v2", view, function (error, couchRes){
    
        if (error) return callback ('CouchDB - ' + error);       
        handleCouchResponse(couchRes.rows);
      });
    }
  }
  

/*
 * handleCouchResponse - process the response from the couch query
 *  
 */
  function handleCouchResponse (resRows) {
    
    var rows = [];
    
    // prepare results to send back
    if (options.view.reduce === false) {
      rows.push(['time','price','baseAmount','counterAmount','account','counterparty','tx_hash']);
      resRows.forEach(function(row){
        var time = row.key ? row.key.slice(1) : row.value[5];
        rows.push([
          moment.utc(time).format(),
          row.value[2],         //price
          row.value[1],         //get amount
          row.value[0],         //pay amount
          row.value[3],         //account
          row.value[4],         //counterparty
          row.value[6],         //tx hash
          parseInt(row.id, 10)  //ledger index
        ]);  
      });
   
    } else {
      // data structure for grouping results 
      if (options.multiple > 1) rows = applyGroupMultiple(resRows); 
      else {
          
        resRows.forEach(function(row){
          //row.key will be null if this is reduced to a single row
          var startTime = row.key ? row.key.slice(1) : options.startTime;

          rows.push([
            moment.utc(startTime).format(), //start time
            row.value.curr2Volume,
            row.value.curr1Volume,
            row.value.numTrades,
            row.value.open,
            row.value.high,
            row.value.low,
            row.value.close,
            row.value.volumeWeightedAvg,
            moment.utc(row.value.openTime).format(),  //open  time
            moment.utc(row.value.closeTime).format(), //close time
            false //partial row, default false
          ]);
        });  

        //if a group could have had trades that are not
        //represented because of the alignment of the start time
        //and/or end time, flag those groups as partial.
        //they will not be saved to the cache.
        if (rows.length && options.increment) {
          var firstStart = moment.utc(rows[0][0]);
          var lastEnd    = moment.utc(rows[rows.length-1][0]).add(options.increment, options.multiple);
          var now        = moment.utc();
          
          if (firstStart.diff(options.startTime)<0) rows[0][11] = true;
          if (lastEnd.diff(options.endTime)>0)      rows[rows.length-1][11] = true;
          else if (lastEnd.diff(now)>0)             rows[rows.length-1][11] = true;
        }
      }
      
      //prepend header row
      rows.unshift([
        'startTime', 'baseVolume', 'counterVolume', 'count', 
        'open',      'high',       'low',           'close', 
        'vwap',      'openTime',   'closeTime',     'partial',
      ]);
    }
    

    //cache results
    if (CACHE) {
      var header = rows.shift();

      if (rows.length) cacheResults(rows);
      if (options.cached) {
        if (options.cached.length && rows.length) {
          var last  = options.cached[options.cached.length-1];
          var first = rows[0];
          if (last[0]==first[0]) {
            console.log("duplicate interval");
            console.log(last, first);
            console.log(options.view, options.subview);
            options.cached.pop(); //remove it to stop the error
          }
        }
        rows = options.cached.concat(rows);
      }
      
      rows.unshift(header); //put back the header row;
    }    
    
    handleResponse (rows); 
  }
  

/*
 * getCached - check the cache for existing data that overlaps
 * with this query.  If its found, return it and adjust the
 * view options accordingly.
 * 
 */  
  function getCached (callback) {

    var keyBase = parseKey(options)+":points";  
        
    //we dont cache unreduced or completely reduced results
    if (options.view.reduce===false || !options.view.group_level) {
      callback (null);
      return;
      
    } else {

      //get the start time of the first complete interval
      var time = moment.utc(options.alignedFirst);
      var end  = moment.utc(options.alignedLast);
      var keys = [], cached = [], row, last;
      
      //if its not aligned, skip it because it wont be in the cache
      if (time.diff(options.startTime)) time.add(options.increment, options.multiple);
      
      //set up key list      
      while(end.diff(time)>0) {
        keys.push(keyBase+":"+time.unix());
        time.add(options.increment, options.multiple);
      }
      
      //get cached points for the range
      redis.mget(keys, function(error, res){
        if (error)       return callback(error);
        if (!res.length) return callback();

        for (var i=0; i<res.length; i++) {
          if (!res[i]) break; //missing data from this point
          row  = JSON.parse(res[i]);
          last = row[0];

          if (row.length==1) continue;  //empty row
          cached.push(row);             //add to the list of cached results;
        }
        
        if (!last) return callback();   //no cached rows 
        last = moment.utc(last);
         
        //adjust range of query to exclude cached results
        //add the interval to this time so we dont
        //get the last one again.         
        var key = options.view.startkey.slice(0,1);
        
        last.add(options.increment, options.multiple);
        options.cached           = cached;
        options.subview          = JSON.parse(JSON.stringify(options.view)); //shallow copy
        options.subview.startkey = key.concat(last.toArray().slice(0,6));

        callback(); //continue from the last cached point       
      });
    }    
  }
  

/*
 * cacheResults - save the data returned from couch if it
 * is of a type we are caching.
 * 
 */  
  function cacheResults(rows) {
    
    var key   = parseKey(options)+":points";
    var start = options.subview ? options.subview.startkey.slice(1) : options.alignedFirst;
    
    //we dont cache unreduced or completely reduced results
    if (options.view.reduce===false || !options.view.group_level) {
      return;
      
    } else {
      
      points = prepareRows(key, rows, start);
      
      if (points.length) {

        //args.unshift(key+":points");
        redis.mset(points, function(error, res){
          if (error) return callback("Redis - " + error);
          if (DEBUG) winston.info(points.length/2 + " points cached");
        });
      }
    }    
  }

  
  function parseKey(opts) {
  /*  
    var key = "OE:"+opts.view.startkey[0][0];
    if (opts.view.startkey[0][1]) key += "."+opts.view.startkey[0][1];
    key += ":"+opts.view.startkey[1][0];
    if (opts.view.startkey[1][1]) key += "."+opts.view.startkey[1][1];
  */
    var key = "OE:"+opts.view.startkey[0];    
    key += ":"+ (opts.increment || "all");
       
    if (opts.view.reduce===false) {
      key += ":unreduced";
      if (opts.view.limit) key += ":limit:"+opts.view.limit;  
                
    } else if (opts.multiple && opts.increment) {
      key += ":"+ (opts.multiple); 
    
    }
  
    return key;
  }  

  function prepareRows(keyBase, rows, start) {
    
    var time = moment.utc(start);
    var max  = moment.utc(); //now
    var temp = {}, timestamp, key, results = [];
    
    //use the lesser of current time or endTime    
    if (max.diff(options.endTime)>0) max = moment.utc(options.endTime);
    max.subtract(options.increment, options.multiple);
    
    rows.forEach(function(row){
      temp[moment.utc(row[0]).unix()] = row;
    });
    
    while (options.endTime.diff(time)>0) {
      timestamp = time.unix();
      key       = keyBase+":"+timestamp;
     
      if (temp[timestamp]) {

        //if its not a partial, cache it        
        if (!temp[timestamp][11]) {
          
          results.push(key);
          results.push(JSON.stringify(temp[timestamp]));
        }
      
      //add a null row for everything except the first 
      //(unless the start time is properly aligned) 
      } else if (timestamp == options.alignedFirst.unix()) {
        if (options.alignedFirst.isSame(options.startTime)) {
          results.push(key);
          results.push(JSON.stringify([time.format()])) 
        }
      
      } else if (time.diff(max)<=0) { 
        results.push(key);
        results.push(JSON.stringify([time.format()]));        
      
      } else break;
      
      //increment to the next candle
      time.add(options.increment, options.multiple);
    } 
    
    return results;  
  }
  
/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (rows) {
     
    if (params.format === 'csv') {

      var csvStr = _.map(rows, function(row){
        return row.join(', ');
      }).join('\n');

      // provide output as CSV
      return callback(null, csvStr);

    } else if (params.format === 'json') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.startTime     = moment.utc(options.startTime).format();
      apiRes.endTime       = moment.utc(options.endTime).format();
      apiRes.base          = params.base;
      apiRes.counter       = params.counter;
      apiRes.timeIncrement = options.increment || "all";
      if (options.multiple && options.multiple>1) apiRes.timeMultiple = options.multiple;
      
      rows.shift();//get rid of header
      
      if (options.view.reduce === false) {
        apiRes.results = _.map(rows, function(row){
          return {
            time          : row[0],
            price         : row[1],
            baseAmount    : row[2],
            counterAmount : row[3],
            account       : row[4],
            counterparty  : row[5],
            tx_hash       : row[6],
            ledgerIndex   : row[7]
          };
        });
        
      } else {
        
                   
        apiRes.results = _.map(rows, function(row, index){
          return {
            startTime     : moment.utc(row[0]).format(),
            openTime      : moment.utc(row[10]).format(),
            closeTime     : moment.utc(row[9]).format(),
            baseVolume    : row[1],
            counterVolume : row[2],
            count         : row[3],
            open          : row[4],
            high          : row[6],
            low           : row[7],
            close         : row[5],
            vwap          : row[8],
            partial       : row[11],
          };
        });          
      }
      
      return callback (null, apiRes);

    } else {
      //no format or incorrect format specified
      return callback (null, rows);      
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
    var epochStartTime = moment.utc(options.alignedFirst); //clone it
    var epochEndTime   = moment.utc(epochStartTime);

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
        element.value.epochTime = epochStartTime.format();
  
        // increment epoch start & close time
        epochStartTime.add(options.increment, params.timeMultiple);
        epochEndTime.add(options.increment, params.timeMultiple);

        // create a new row for every epoch
        tabledRowCount = tabledRowCount + 1;
        tabledRows[tabledRowCount] = [];

        // reset index for storage into new row
        newElementCount = 0;
      }

      // set element time to be that of beginning of epoch
      element.value.epochTime = epochStartTime.format();

      // store row to be grouped
      tabledRows[tabledRowCount][newElementCount] = element;

      // increment variable used for counting and indexing row elements
      newElementCount = newElementCount + 1;
    });

    // data structures for grouping results 
    var groupedStartTime = 0, groupedOpenTime,        groupedCloseTime,
      groupedBaseVolume,      groupedCounterVolume,   groupedNumTrades,       
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
          groupedBaseVolume      = 0;
          groupedCounterVolume   = 0;
          groupedNumTrades       = 0;
          groupedHighPrice       = 0;
          groupedLowPrice        = Number.MAX_VALUE;
          groupedVwavPrice       = 0;
          groupedVwavNumerator   = 0;
          groupedVwavDenominator = 0;
        }
        
        // SUM: base currency volume
        groupedBaseVolume = parseFloat(groupedBaseVolume) + parseFloat(e.value.curr2Volume);

        // SUM: trade currency volume
        groupedCounterVolume = parseFloat(groupedCounterVolume) + parseFloat(e.value.curr1Volume);

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
          groupedBaseVolume, 
          groupedCounterVolume, 
          groupedNumTrades, 
          groupedOpenPrice,
          groupedHighPrice, 
          groupedLowPrice,  
          groupedClosePrice, 
          groupedVwavPrice,
          moment.utc(groupedOpenTime).format(),
          moment.utc(groupedCloseTime).format(),
          false
        ]);
        
        groupedStartTime = 0;
      }
    });

    //if the first group could have had trades that are not
    //represented because of the alignment of the start time
    //and/or end time, flag those groups as partial.
    //they will not be saved to the cache.
    if (results.length) {
      var now = moment.utc();
      if (moment.utc(results[0][0]).diff(options.startTime)<0) results[0][11] = true;
      if (epochEndTime.diff(options.endTime)>0) results[results.length-1][11] = true;
      else if (epochEndTime.diff(now)>0)        results[results.length-1][11] = true;
    }

    return results;      
  }
  
  
/*
 * parseOptions - parse request parameters to determine the view
 * options for the couch query.
 * 
 */
  function parseOptions () {
    
    if (!params.base || !params.counter) {
      options.error = 'please specify base and counter currencies';
      return;
    }
  
    // parse base currency details
    var base, counter;
    
    if (!params.base.currency) {
        options.error = 'please specify a base currency';
        return;
      
    } else if (!params.base.issuer) {
      
      if (params.base.currency.toUpperCase() === 'XRP') {
        options.base = 'XRP';
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
      
    } else if (params.base.issuer && ripple.UInt160.is_valid(params.base.issuer)) {
      options.base = params.base.currency.toUpperCase()+"."+params.base.issuer;
      
    } else {
      var baseGatewayAddress = gatewayNameToAddress(params.base.issuer, params.base.currency.toUpperCase());
      if (baseGatewayAddress) {
        options.base = params.base.currency.toUpperCase()+"."+baseGatewayAddress;
        
      } else {
        options.error = 'invalid base currency issuer: ' + params.base.issuer;
        return;
      }
    }
  
    // parse counter currency details
    if (!params.base.currency) {
      options.error = 'please specify a base currency';
      return;
      
    } else if (!params.counter.issuer) {
      if (params.counter.currency.toUpperCase()  === 'XRP') {
        options.counter = 'XRP';
      } else {
        options.error = 'must specify issuer for all currencies other than XRP';
        return;
      }
    } else if (params.counter.issuer && ripple.UInt160.is_valid(params.counter.issuer)) {
      options.counter = params.counter.currency.toUpperCase()+"."+params.counter.issuer;
      
    } else {
      var counterGatewayAddress = gatewayNameToAddress(params.counter.issuer, params.counter.currency.toUpperCase());
      if (counterGatewayAddress) {
        options.counter = params.counter.currency.toUpperCase()+"."+counterGatewayAddress;
        
      } else {
        options.error = 'invalid counter currency issuer: ' + params.counter.issuer;
        return;
      }
    }
    
  
    //Parse start and end times
    var time = tools.parseTimeRange(params.startTime, params.endTime, params.descending);
    
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
    var results = tools.parseTimeIncrement(params.timeIncrement);  
    options.multiple = results.group_multiple;
    
    if (typeof params.timeMultiple === 'number') {
      options.multiple = options.multiple ? options.multiple*params.timeMultiple : params.timeMultiple;
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
    if (results.group_level)          options.view.group_level = results.group_level + 2;
    else if (params.reduce === false) options.view.reduce      = false;
  
    var limit  = params.limit  ? parseInt(params.limit, 10)  : 0,
      offset   = params.offset ? parseInt(params.offset, 10) : 0,
      maxLimit = unlimit ? Infinity : 500,
      intervalCount;
      
    if (!limit || limit>maxLimit) limit = maxLimit == Infinity ? null : maxLimit;
      
    if (options.view.reduce===false) {
      if (limit  && !isNaN(limit))  options.view.limit = limit;
      if (offset && !isNaN(offset)) options.view.skip  = offset;
    }  
    
    if (results.group !== false) {
      intervalCount = tools.countIntervals(time.start, time.end, results.name, options.multiple);
      if (intervalCount>maxLimit) {
        return callback("Please specify a smaller time range or larger interval");
      }
    }

    if (DEBUG) {
      var label = params.timeMultiple  ? params.timeMultiple  : "";
      label    += params.timeIncrement ? params.timeIncrement : "";
      if (options.view.limit) label = "limit:"+options.view.limit;
      else if (options.view.reduce===false) label = "unreduced";
      options.view.label = label; 
    }
        
    // set startkey and endkey for couchdb query
    options.view.startkey   = [options.counter+":"+options.base].concat(options.startTime.toArray().slice(0,6));
    options.view.endkey     = [options.counter+":"+options.base].concat(options.endTime.toArray().slice(0,6));
    options.view.descending = params.descending || false; 
    options.view.stale      = "ok"; //dont wait for updates  
   
    options.alignedFirst    = tools.getAlignedTime(options.startTime, options.increment, options.multiple);
    options.alignedLast     = tools.getAlignedTime(options.endTime, options.increment, options.multiple);
    return options;      
  }
}

module.exports = offersExercised;
