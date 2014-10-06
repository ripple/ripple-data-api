var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
  
/**
 * valueSent - get the amount of value sent from any account for a specific currency over time. 
 * 
 * request: {
 *
 *  currency   : ("XRP", "USD", etc.)     //required
 *  issuer     : ("bitstamp", "rxSza...") //required
 *    
 *  startTime     : // range start date + time
 *  endTime       : // range end date + time
 *  timeIncrement : // second, minute, etc.     - optional, defaluts to "all"
 *  descending    : // true/false               - optional, defaults to false
 *  reduce        : // true/false               - optional, ignored if timeIncrement set
 *  limit         : // optional, ignored unless reduce is false - limit the number of returned transactions
 *  offset        : // optional, offset results by n transactions
 *  format        : "json" or "csv" //optional, defaults to CSV-like array
 * }
 *
 * response: {
 *  
 *  currency : //from request
 *  issuer   : //from request 
 *  results  : [
 *    ["time","amount","count or tx_hash"],  //tx_hash if reduce = false 
 *    [
 *      time,
 *      amount,
 *      count/tx_hash
 *    ],
 *            .
 *            .
 *            .
 *            .
 *    ]
 *  }
 *

  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q",
      "startTime" : "Mar 15, 2014 10:00 am",
      "endTime"   : "Mar 16, 2014 10:00 am",
      "reduce"    : false,
      "limit"     : 10,
      "offset"    : 10,
      "format"    : "csv"
      
    }' http://localhost:5993/api/valueSent
     
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am",
      "timeIncrement" : "hour"
      
    }' http://localhost:5993/api/valueSent
 
 curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 4, 2014",
      "endTime"   : "Mar 7, 2014",
      "timeIncrement" : "hour"
      
    }' http://localhost:5993/api/valueSent

 curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "BTC",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am",
      "format"    : "json"
      
    }' http://localhost:5993/api/valueSent 


 curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "XRP",
      "startTime" : "Mar 14, 2014 5:00 pm",
      "endTime"   : "Mar 17, 2014 5:00 pm",
      "format"    : "csv"
      
    }' http://localhost:5993/api/valueSent
    
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "USD",
      "issuer"    : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am"
      
    }' http://localhost:5993/api/valueSent   
    
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency"  : "XRP",
      "startTime" : "Mar 15, 2014 10:00 am",
      "endTime"   : "Mar 16, 2014 10:00 am"
      
    }' http://localhost:5993/api/valueSent       
 */



function valueSent(params, callback) {
  
  var options  = {},
    limit      = params.limit  ? parseInt(params.limit, 10)  : 0,
    offset     = params.offset ? parseInt(params.offset, 10) : 0,
    maxLimit   = 500,
    intervalCount,
    cached;
  
  if (!limit || limit>maxLimit) limit = maxLimit;
  
  //parse currency and issuer  
  var currency = params.currency ? params.currency.toUpperCase() : "";
  var issuer   = params.issuer   ? params.issuer : "";
   
  if (!currency)                    return callback("currency is required");
  if (currency != "XRP" && !issuer) return callback("issuer is required");

    
  //Parse start and end times
  var time = tools.parseTimeRange(params.startTime, params.endTime, params.descending);

  if (time.error) return callback(time.error);

  if (!time.start || !time.end) {
   return callback("startTime and endTime are required.");
  }
      
  var startTime = time.start;
  var endTime   = time.end;

  //parse time increment and time multiple
  var results        = tools.parseTimeIncrement(params.timeIncrement);  
  var group_multiple = results.group_multiple;
  
  if (typeof params.timeMultiple === 'number') {
    group_multiple = group_multiple ? group_multiple*params.timeMultiple : params.timeMultiple;
  } else {
    group_multiple = 1;
  }  
  
  //set view options    
  options.view = {
    startkey : [currency, issuer].concat(startTime.toArray().slice(0,6)),
    endkey   : [currency, issuer].concat(endTime.toArray().slice(0,6))  
  };


  //set reduce option only if its false
  if (results.group_level)          options.view.group_level = results.group_level + 3;
  else if (params.reduce === false) options.view.reduce      = false;
  
  if (options.view.reduce===false) {
    if (limit  && !isNaN(limit))  options.view.limit = limit;
    if (offset && !isNaN(offset)) options.view.skip  = offset;
  } 

  if (results.group !== false) {
    intervalCount = tools.countIntervals(startTime, endTime, results.name);
    if (intervalCount>maxLimit) {
      return callback("Please specify a smaller time range or larger interval");
    }
  }
  
  options.view.increment = results.name;  
  options.view.stale     = "ok"; //dont wait for updates

  
  //get cached results first.  if there are any,
  //the view will be adjusted so that couch is queried for everything else
  if (CACHE) getCached(options.view, function(error, subview, rows) {
    
    cached = rows;
    if (error)    return callback (error);
    if (!subview) return fromCouch(options.view); //no cached
    
    //if the start and end times are the same, there is no need to query couchDB
    if (subview.startkey.toString()===subview.endkey.toString()) {
      return handleResponse(options.view, cached);
    }    
    
    return fromCouch(subview); //some cached results
  });
    
  //cache not activated    
  else fromCouch(options.view);


/*
 * Load data from couchDB
 */      
  function fromCouch(viewOpts) {
    
    //Query CouchDB with the determined viewOpts
    db.view('valueSentV2', 'v1', viewOpts, function(error, couchRes) {
      if (error) return callback ('CouchDB - ' + error);
      
      handleResponse(viewOpts, prepareRows(viewOpts, couchRes.rows));
    });
  }
  
  
/*
 * Prepare data for caching and response
 * 
 */  
  function prepareRows (options, rows) {

    if (options.reduce===false) return rows;
    if (options.increment=="all" || !options.group_level) {
      
      return [[
        moment.utc(options.startkey.slice(2)).format(), 
        rows.length ? rows[0].value[0] : 0,
        rows.length ? rows[0].value[1] : 0
      ]];
    }
        
    if (rows) {       
      var firstTime = moment.utc(options.startkey.slice(2));
      var time      = tools.getAlignedTime(firstTime, options.increment);
      var temp      = {};
      

      rows.forEach(function(row){
        temp[moment.utc(row.key.slice(2)).unix()] = row.value;
      });
      
      rows = [];
      
      while (endTime.diff(time)>0) {
        var row = [time.format()];
        if (temp[time.unix()]) row = row.concat(temp[time.unix()]);
        else                   row = row.concat([0.0,0]);
        rows.push(row); 
                
        time.add(options.increment, 1); //forward 1 increment          
      }
    }   
    
    if (CACHE) {     

      cacheResults(options, rows); //cache new results
      
      //get rid of the first row if it is a duplicate of
      //the first cached row, then combine the two
      if (cached && cached.length) {
     
      if (rows.length && rows[0][0]==cached[0][0]) rows.shift();
      rows = cached.concat(rows);
      }
    }
    
    return rows;
  }


/*
 * get any cached data for this range and interval 
 */
  function getCached(options, callback) {
    
    //we dont cache completely reduced results
    if (options.reduce===false || !options.group_level) {
      return callback (null);  
    } 
    
    var keyBase   = parseKey(options);
    var firstTime = moment.utc(options.startkey.slice(2));
    var time      = tools.getAlignedTime(firstTime, options.increment);
    var end       = tools.getAlignedTime(options.endkey.slice(2), options.increment);
    var cached    = [], keys = [];
    
    //skip the first unless it happens to be properly aligned
    if (time.diff(firstTime)) time.add(options.increment, 1);
    
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
      last = moment.utc(last).add(options.increment, 1); //start with the next increment
      
      //adjust range of query to exclude cached results             
      var key     = options.startkey.slice(0,2);
      var subview = JSON.parse(JSON.stringify(options)); //shallow copy
      
      subview.startkey = key.concat(last.toArray().slice(0,6));
      callback(null, subview, cached);
    });
          
  }


/*
 * save the results from couch into the cache
 * 
 */  
  function cacheResults (options, rows) {
    
    var keyBase   = parseKey(options);
    var firstTime = moment.utc(options.startkey.slice(2));
    var time      = tools.getAlignedTime(firstTime, options.increment);
    var end       = moment.utc(options.endkey.slice(2)).subtract(options.increment, 1);
    var points    = [];
    
    if (options.increment=="all") return; //ignore these
    if (options.reduce===false || !options.group_level) return; //ignore these too
    
    rows.forEach(function(row){
      var time    = moment.utc(row[0]);
      var aligned = tools.getAlignedTime(time, options.increment);
      var key     = keyBase+":"+time.unix();
            
      //exclude the ones that aren't aligned
      //this should be the first and last unless the
      //client aligned them properly beforehand
       
      if (time.diff(aligned)) return; 
      if (time.diff(end)>0)   return;
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

  
  /*
   * create the key used for the cache from the options
   */
  function parseKey(options) {    
    return "VS:"+options.startkey[0]+":"+
      options.startkey[1]+":"+
      options.group_level; 
  }
  
  
/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (viewOpts, rows) {   
    
    if (params.format === 'json') { 
      var response = {
        currency      : currency,
        issuer        : issuer,
        startTime     : startTime.format(),
        endTime       : endTime.format(),  
        timeIncrement : params.timeIncrement,
        results       : []
      };
      
      rows.forEach(function(row){
        if (viewOpts.reduce === false) {
          response.results.push({
            time        : moment.utc(row.key.slice(2)).format(),
            amount      : row.value[0],
            account     : row.value[1],
            destination : row.value[2],
            txHash      : row.value[3],
            ledgerIndex : parseInt(row.id, 10) 
          });
      
        } else {
          response.results.push({
            time   : row[0] ? moment.utc(row[0]).format() : null,
            amount : row[1],
            count  : row[2]
          });         
        } 
      });
      
      return callback(null, response);
         
    } else {
      
    
      var header = ["time","amount"];
      if (viewOpts.reduce === false) header = header.concat(["account","destination","txHash","ledgerIndex"]);
      else                           header.push("count");
      
      if (viewOpts.reduce === false) {
        header = header.concat(["account","destination","txHash","ledgerIndex"]);
        rows.forEach(function(row, index) {
          var value = row.value;
          var time  = row.key ? moment.utc(row.key.slice(2)) : startTime;
          value.unshift(time.format());
          if (row.id) value.push(parseInt(row.id, 10));
          rows[index] = value;
        });  
                 
      } else {
        header.push("count");
      }
      
      rows.unshift(header);  
      
      if (params.format === 'csv') {

        var csvStr = _.map(rows, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        return callback(null, csvStr);

      } else {
        //no format or incorrect format specified
        return callback(null, rows); 
      }
    }
  }
}

module.exports = valueSent;