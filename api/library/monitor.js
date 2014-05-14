var env   = process.env.NODE_ENV || "development",
  winston = require('winston'),
  moment  = require('moment'),
  http    = require('http'),
  https   = require('https');

//ledger check variables  
var last, resetCache, interval;
  
//log incomming request and que depth  
module.exports.logRequest = function (route) {

  datadog.increment('ripple_data_api.post', null, ["route:"+route, "node_env:"+env]);
  setTimeout(function(){
    datadog.gauge('ripple_data_api.couchDB_queDepth', countSockets(), null, ["node_env:"+env]);
  }, 100);
      
  function countSockets () {
    var count = 0;
    for (var key1 in http.globalAgent.sockets) {
      count += http.globalAgent.sockets[key1].length;
    }
      
    for (var key2 in https.globalAgent.sockets) {
      count += https.globalAgent.sockets[key2].length;
    } 
    
    if (DEBUG) winston.info("open sockets: ", count);
    return count; 
  }  
}
  

//log response time for request  
module.exports.logResponseTime = function (time, route) {
  datadog.histogram('ripple_data_api.responseTime', time, null, ["route:"+route, "node_env:"+env]);
}


//initialize monitoring of ledger close latency
module.exports.ledgerMonitor = function () {
  if (interval) clearInterval(interval);  
  last       = null;  //last consecutive ledger
  resetCache = false; //flag for cache resetting  
  interval   = null;  //ledgerCheckInterval
  setImmediate(ledgerCheck); 
}

//check ledgers for latency.  We will use this to determine if 
//the importer is functioning, and also to reset the cache in 
//the event of a severe latency spike that later returns to normal.
function ledgerCheck(startTime) {
  if (!startTime && last) startTime = moment.utc(last[0]).subtract(30, "seconds");
  else if (!startTime)    startTime = moment.utc().subtract(15, "minutes");
    
  var params = {
    startTime  : startTime,
    descending : false,
    reduce     : false    
  };
  
  require("../routes/ledgersClosed")(params, function(error, data) {
    
    var time, diff;
    
    if (error) {
      return winston.error("Ledger Check - ", error);
    }
    
    data.shift(); //remove header row
    
    if (!last) {
      diff = data.length ? 0 - startTime.diff(data[0][0])/1000 : Infinity;

      if (moment.utc().diff(startTime) >= (24*60*60*1000)) {
        winston.info("Incomplete ledger history over the last 24 hours");
        return;
        
      } else if (diff>30) {
        startTime.subtract(30, "minutes")
        winston.info("Farther back: ", startTime.format());
        ledgerCheck(startTime);
        return;
        
      } else {
        
        //setup a reccurring check
        if (interval) clearInterval(interval);
        interval = setInterval(ledgerCheck, 60000);
      }
    }
    
    if (data.length) {
      last = data.shift();
      for (var i=0; i<data.length; i++) {
        
        if (data[i][1]==last[1]+1) last = data[i];
        else {

          winston.info("non-consecutive ledgers:", data[i], last[0], last[1]);
          break;
        }
      }
    }
    
    time = moment.utc();
    diff = time.diff(last[0])/1000;
    
    if (DEBUG) winston.info("Ledger latency:", diff+"s", last[1]);
    datadog.gauge('ripple_data_api.ledger_latency', diff, null, ["node_env:"+env]);
        
    //if the latency is greater than 4 mintues, activate the 
    //reset flag.  If the ledger latency gets back down under 30 seconds,
    //we will reset the cache to clear out any false data stored,
    //and turn the flag back off.    
    if (diff>(4 * 60)) {
      resetCache = true;
      
      //for now, we are going to just reset last so that
      //it will skip over what is most likely a missed ledger
      last = null;

    } else if (resetCache && diff<30) {
      if (0 && CACHE) redis.flushdb(); //disabled for now
      resetCache = false;  
    }
    
  });
    
}

/*
 * 
   curl  -H "Content-Type: application/json" -X POST -d '{
  
      "method" : "ledger", 
      "params" : [ { 
        "ledger_index" : 6198471, 
        "transactions" : true, 
        "expand"       : true
      } ] 
   }' http://s_east.ripple.com:51234
 
  
 */