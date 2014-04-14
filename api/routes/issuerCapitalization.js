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
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am",
      "currencies" : [{"currency"  : "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}],
      "timeIncrement" : "month"
      
    }' http://localhost:5993/api/issuer_capitalization

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Mar 5, 2011 10:00 am",
      "endTime"   : "Mar 6, 2015 10:00 am",
      "currencies" : [{"currency"  : "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}],
      "timeIncrement" : "month"
      
    }' http://localhost:5993/api/issuer_capitalization 
 
 */


function issuerCapitalization(params, callback) {

  var error, currencies = []
  
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
  
  
  //Parse start and end times
  var time = tools.parseTimeRange(params.startTime, params.endTime, params.descending);
  
  if (time.error)               return callback(time.error);
  if (!time.start || !time.end) return callback("startTime and endTime are required.");
    
  var startTime = time.start;
  var endTime   = time.end;


  //Parse timeIncrement and timeMultiple
  var results        = tools.parseTimeIncrement(params.timeIncrement);
  var group          = results.group;
  var group_level    = results.group_level;

  //currencies = [currencies.pop()]; //for testing
 
  
  //get capitalization data for each currency
  async.map(currencies, function(c, asyncCallbackPair){

    var options  = {};
    if (results.name && results.name != "all") {
      options.increment   = results.name;
      options.alignedTime = tools.getAlignedTime(startTime, results.name);
    }
    
    // Setup CouchDB view options
    options.view = {
      startkey : [c.currency+"."+c.issuer].concat(startTime.toArray().slice(0,6)),
      endkey   : [c.currency+"."+c.issuer].concat(endTime.toArray().slice(0,6)),
      reduce   : true,
    };
    
    if (group) viewOpts.group = group;
    if (group_level) {
      // +3 to account for 1-based indexing in CouchDB and 
      // startkey having the [c.issuer, c.currency] first
      options.view.group_level = group_level + 2; 
    }

    options.view.stale = "ok"; //dont wait for updates
 
 
    //get cached results first.  if there are any,
    //the view will be adjusted so that couch is queried for everything else
    if (CACHE) getCached(options, function(error) {
      
      if (error) return callback (error);
      return fromCouch(options, c, asyncCallbackPair)
    });
    
    //cache not activated    
    else fromCouch(options, c, asyncCallbackPair);
           

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

    //Query CouchDB for changes in trustline balances    
    db.view('currencyBalances', 'v1', viewOptions, function(error, trustlineRes){
      
      if (error) return callback("CouchDB - " + error);
      
      //if there are cached results, we can get the start capitalization from there
      if (options.cached && options.cached.length) {
        startCapitalization = options.cached[options.cached.length-1][1];
        c.results = prepareRows(options, startCapitalization, trustlineRes.rows);
        callback(null, c);
        
      //otherwise, we need to get the reduced result from the begining of
      //time to the start of our range.  
      } else {
        var initialValueViewOpts = {
          startkey : [c.currency+"."+c.issuer],
          endkey   : viewOptions.startkey,
          group    : false,
          stale    : "ok"
        };
  
        //query couchDB for the start capitalization
        db.view('currencyBalances', 'v1', initialValueViewOpts, function(error, initValRes) {
        
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
          
          //we have all the required pieces, now we can put together the results
          c.results = prepareRows(options, startCapitalization, trustlineRes.rows);
          callback(null, c);
        });
      }
    });    
  }
  
  
  /*
   * this function take the start capitalization, range results, cached results
   * and options to finalize a result.
   */
  function prepareRows (options, startCapitalization, rows) {
    
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
      
      if (CACHE) {     
      
        cacheResults(options, rows); //cache new results
        
        //get rid of the first row if it is a duplicate of
        //the first cached row, then combine the two
        if (options.cached && options.cached.length) {
       
          if (rows.length && rows[0][0]==options.cached[0][0]) rows.shift();
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
    var end      = tools.getAlignedTime(options.endTime);
    var cached   = [], keys = [];
    
    //skip the first unless it happens to be properly aligned
    if (time.diff(options.startTime)) time.add(options.increment, 1);
    
    //set up key list      
    while(end.diff(time)>0) {
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
    var end     = moment.utc(endTime);
    var points  = [];
    
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
}

module.exports = issuerCapitalization;