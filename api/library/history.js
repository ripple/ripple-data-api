var env    = process.env.NODE_ENV || "staging",
  DBconfig = require('../../db.config.json')[env],
  config   = require('../../deployment.environments.json')[env];

var fs    = require('fs'),
  _       = require('lodash'),
  winston = require('winston'),
  moment  = require('moment');

function saveHistory (metric, interval, done) {
  var start = moment.utc("Jan 1 2013 0:00+0:00"), 
    time    = moment.utc(start).add(1, interval),
    end     = moment.utc(), //now
    fn, params;
  
  if (metric === 'topMarkets')             fn = require("../routes/topMarkets");
  else if (metric === 'totalValueSent')    fn = require("../routes/totalValueSent");
  else if (metric === 'totalNetworkValue') fn = require("../routes/totalNetworkValue");
  else return winston.error("invalid metric");

  
  if (interval != 'month' && interval != 'day') return winston.error('invalid interval');
  
  next(); //start
  
  function getStat(callback) {
    if (metric == 'totalNetworkValue') params = {
      time : time.format()  
    } 
           
    else params = {
      startTime : start.format(),
      endTime   : time.format()  
    }
    
    if (DEBUG) winston.info("cacheing metric: ", metric, interval, time.format());
    fn(params, function(err, res){
      if (err) return callback(err);
      
      //we are assuming at this point it has been cached
      //by the function that retreived the data
      return callback ();         
    });      
  }
  
  function next() {
    getStat(function(err, res){
      start.add(1, interval);
      time.add(1, interval);  
      if (end.diff(time)>0) return next();
      winston.info("finished cacheing " + metric + " - " + interval);
      done();
    });
  }
} 

module.exports.init = function () {
  saveHistory('topMarkets', "month", function() {
    saveHistory('totalValueSent', "month", function() {
      saveHistory('totalNetworkValue', "month", function() {
        /*
        saveHistory('topMarkets', "day", function() {
          saveHistory('totalValueSent', "day", function() {
            saveHistory('totalNetworkValue', "day", function() {  
              winston.info("finished cacheing historical metrics");     
            });    
          });
        });
        */    
      });    
    });
  });
}
