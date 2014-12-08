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
    "counter"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "base" : {"currency": "0158415500000000C1F76FF6ECB0BAC600000000", "issuer" : "rrh7rf1gV2pXAoqA8oYbpHd8TKv5ZQeo67"},
    "startTime" : "Mar 10, 2012 4:35 am",
    "endTime"   : "Sept 11, 2014 5:10:30 am",
    "limit" : 10,
    "reduce" : false,
    "descending" : false,
    "format"        : "csv"
      
    }' http://localhost:5993/api/offersExercised

  curl -H "Content-Type: application/json" -X POST -d '{
    "base"  : {"currency": "USD", "issuer" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "counter" : {"currency": "0158415500000000C1F76FF6ECB0BAC600000000", "issuer" : "rrh7rf1gV2pXAoqA8oYbpHd8TKv5ZQeo67"},
    "startTime" : "Mar 10, 2014 4:35 am",
    "endTime"   : "Sept 11, 2014 5:10:30 am",
    "timeIncrement" : "day",
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

      db.view("offersExercisedV3", "v2", view, function (error, couchRes){        
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
            row.value.curr1Volume / row.value.curr2Volume,
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
        
        //options.alignedFirst     = last;
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
    var max  = moment.utc().subtract(6, 'minutes');
    var temp = {}, timestamp, key, results = [];
    
    //use the lesser of current time or endTime    
    if (max.diff(options.endTime)>0) max = moment.utc(options.endTime);
    max.subtract(options.increment, options.multiple);

    rows.forEach(function(row){
      temp[moment.utc(row[0]).unix()] = row;
    });

    while (max.diff(time)>0) {
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
  
 /**
  * handleResponse - format the data according to the requirements
  * of the request and return it to the caller. 
  */  

  function handleResponse (rows) {
    
    if (options.invert) {
      rows = invertPair(rows, options.view.reduce);
    }
    
    //this doesnt really belong here, it should have been calculated in 
    //in the couchDB view, but until that day, this works pretty well.
    rows = handleInterest(rows);
    
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
            openTime      : moment.utc(row[9]).format(),
            closeTime     : moment.utc(row[10]).format(),
            baseVolume    : row[1],
            counterVolume : row[2],
            count         : row[3],
            open          : row[4],
            high          : row[5],
            low           : row[6],
            close         : row[7],
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
    
    if (!rows || !rows.length) return [];
    
    //get initial epoch end time as aligned from the first row
    var time    = rows[0].key ? rows[0].key.slice(1) : rows[0].value.openTime;
    var results = [];
    var reduced;
    var now;

    var addResult = function addResult (reduced) {
      results.push([
        reduced.startTime, 
        reduced.curr2Volume, 
        reduced.curr1Volume, 
        reduced.numTrades, 
        reduced.open,
        reduced.high, 
        reduced.low,  
        reduced.close, 
        reduced.curr1Volume / reduced.curr2Volume,
        moment.utc(reduced.openTime).format(),
        moment.utc(reduced.closeTime).format(),
        false
      ]);      
    }
    
    time = tools.getAlignedTime(time, options.increment, options.multiple);
    rows.forEach(function(row){
         
      //if the epoch end time is less than or equal
      //to the open time of the segment, start a new row
      //its possible that the first could have a time
      //diff of 0, we want to accept that as well         
      if (time.diff(row.value.openTime) < 0 || !reduced) {
        
        //this is the complete row, add it to results
        if (reduced) addResult(reduced);
        
        //set this row as the first, and advance the
        //epoch tracker past this interval
        reduced = row.value;

        while(time.diff(reduced.openTime) <= 0) {
          reduced.startTime = time.format();
          time.add(options.increment, options.multiple); //end of epoch 
        } 

        return;
      }
      
      //merge this data with the previous rows
      if (row.value.openTime<reduced.openTime) {
        reduced.openTime = row.value.openTime;
        reduced.open     = row.value.open;
      }
      
      if (reduced.closeTime<row.value.closeTime) {
        reduced.closeTime = row.value.closeTime;
        reduced.close     = row.value.close;
      }

      if (row.value.high>reduced.high) reduced.high = row.value.high;
      if (row.value.low<reduced.low)   reduced.low  = row.value.low;

      reduced.curr1Volume += row.value.curr1Volume;
      reduced.curr2Volume += row.value.curr2Volume;
      reduced.numTrades   += row.value.numTrades;
    });
    
    addResult(reduced); //add the last row
    
    //if the first group could have had trades that are not
    //represented because of the alignment of the start time
    //and/or end time, flag those groups as partial.
    //they will not be saved to the cache.
    now = moment.utc();
    if (moment.utc(results[0][0]).diff(options.startTime)<0) results[0][11] = true;
    if (time.diff(options.endTime)>0) results[results.length-1][11] = true;
    else if (time.diff(now)>0)        results[results.length-1][11] = true;
   
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
      var baseGatewayAddress = tools.gatewayNameToAddress(params.base.issuer, params.base.currency.toUpperCase());
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
      var counterGatewayAddress = tools.gatewayNameToAddress(params.counter.issuer, params.counter.currency.toUpperCase());
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
      return;
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
    
    var key;
    
    if (options.base < options.counter) {
      key = options.base + ":" + options.counter;
      options.invert = true;
      
    } else {
      key = options.counter + ":" + options.base;
    }
    
    
    // set startkey and endkey for couchdb query
    options.view.startkey   = [key].concat(options.startTime.toArray().slice(0,6));
    options.view.endkey     = [key].concat(options.endTime.toArray().slice(0,6));
    options.view.descending = params.descending || false; 
    options.view.stale      = "ok"; //dont wait for updates  
   
    options.alignedFirst    = tools.getAlignedTime(options.startTime, options.increment, options.multiple);
    options.alignedLast     = tools.getAlignedTime(options.endTime, options.increment, options.multiple);
    return options;      
  }
  
  /**
   * apply interest to interest/demmurage currencies
   * @param {Object} rows
   */
  function handleInterest (rows) {
    var base    = ripple.Currency.from_json(params.base.currency);
    var counter = ripple.Currency.from_json(params.counter.currency);
    
    if (base.has_interest()) {
      if (options.view.reduce === false) {
        rows.forEach(function(row, i){
          if (!i) return;
        
          //apply interest to the base amount
          amount = ripple.Amount.from_human(row[2] + " " + params.base.currency).applyInterest(new Date(row[0])).to_human(); 
          pct   = row[2]/amount; 
          
          rows[i][2]  = amount;
          rows[i][1] *= pct;         
        });
        
      } else {
        rows.forEach(function(row, i){
          if (!i) return;
          
          //apply interest to the base volume
          value = ripple.Amount.from_human(row[1] + " " + params.base.currency).applyInterest(new Date(row[0])).to_human(); 
          pct   = row[1]/value;
          
          //adjust the prices
          rows[i][1] = value;
          rows[i][4] *= pct;
          rows[i][5] *= pct;
          rows[i][6] *= pct;
          rows[i][7] *= pct;
          rows[i][8] *= pct;
        });
      }
    } else if (counter.has_interest()) {
      if (options.view.reduce === false) {
        rows.forEach(function(row, i){
          if (!i) return;
          
          //apply interest to the counter amount
          amount = ripple.Amount.from_human(row[3] + " " + params.counter.currency).applyInterest(new Date(row[0])).to_human(); 
          pct   = amount/row[3]; 
          
          rows[i][3]  = amount;
          rows[i][1] *= pct;         
        });
        
      } else {         
        rows.forEach(function(row, i){
          if (!i) return;
          
          //apply interest to the counter volume
          value = ripple.Amount.from_human(row[2] + " " + params.counter.currency).applyInterest(new Date(row[0])).to_human(); 
          pct   = value/row[2];
          
          //adjust the prices
          rows[i][2] = value;
          rows[i][4] *= pct;
          rows[i][5] *= pct;
          rows[i][6] *= pct;
          rows[i][7] *= pct;
          rows[i][8] *= pct;
        });
      }      
    }
    
    return rows;
  }

 /**
  * if the base/counter key was inverted, we need to swap
  * some of the values in the results
  */

  function invertPair (rows, reduced) {
    var swap;
    var i;
    
    if (reduced === false) {      
      //skip the first, invert the rest
      for (i=1; i<rows.length; i++) { 
        rows[i][1] = 1/rows[i][1];
        
        //swap base and counter vol
        swap = rows[i][2];
        rows[i][2] = rows[i][3];
        rows[i][3] = swap;
        
        //swap account and counterparty
        swap = rows[i][4];
        rows[i][4] = rows[i][5];
        rows[i][5] = swap;
      }
      
    } else {
      
      //skip the first, invert the rest
      for (i=1; i<rows.length; i++) {

        //swap base and counter vol
        swap = rows[i][1]; 
        rows[i][1] = rows[i][2];
        rows[i][2] = swap; 
        rows[i][4] = 1/rows[i][4];

        //swap high and low
        swap = 1/rows[i][5]; 
        rows[i][5] = 1/rows[i][6];
        rows[i][6] = swap; 
        rows[i][7] = 1/rows[i][7];
        rows[i][8] = 1/rows[i][8];
      }
    }
    
    return rows;
  }
}


module.exports = offersExercised;
