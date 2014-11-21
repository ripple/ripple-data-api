var env      = process.env.NODE_ENV || "staging";
var DBconfig = require('../../db.config.json')[env];
var config   = require('../../deployment.environments.json')[env];
var _        = require('lodash');
var winston  = require('winston');
var moment   = require('moment');
var schedule = require('node-schedule');

function saveHistory (metric, interval, done) {
  var start = moment.utc("Jan 1 2013 0:00+0:00");
  var end   = moment.utc().startOf(interval); //now
  var time  = moment.utc(end).subtract(1, interval);
  var fn;
  var params;
  
  if (metric === 'totalTradeVolume')       fn = require("../routes/totalTradeVolume");
  else if (metric === 'totalValueSent')    fn = require("../routes/totalValueSent");
  else if (metric === 'totalNetworkValue') fn = require("../routes/totalNetworkValue");
  else return winston.error("invalid metric");

  if (interval != 'month' && 
      interval != 'week' &&
      interval != 'day') return winston.error('invalid interval');
  
  next(); //start
  
  function getStat(callback) {
    if (metric == 'totalNetworkValue') params = {
      time    : time.format(),
      history : true  
    } 
           
    else params = {
      startTime : time.format(),
      endTime   : end.format(),
      history   : true  
    }
    
    if (DEBUG) winston.info("cacheing metric: ", metric, interval, time.format());
    fn(params, function(err, res){
      if (err) return callback(err);
 
      //we are assuming at this point it has been cached
      //by the function that retreived the data
      //if it was already cached, res should be true
      return callback (null, res);         
    });      
  }
  
  function next() {
    getStat(function(err, res){     
      end.subtract(1, interval);
      time.subtract(1, interval);  
      if (start.diff(time)<=0) return next();
      winston.info("finished cacheing " + metric + " - " + interval);
      done();
    });
  }
} 

module.exports.init = function () {
  var offset      = Math.ceil(new Date().getTimezoneOffset()/60); 
  var dailyRule   = new schedule.RecurrenceRule(null, null, null, null, offset, 15, 0);
  var weeklyRule  = new schedule.RecurrenceRule(null, null, null, 1, offset, 10, 0);
  var monthlyRule = new schedule.RecurrenceRule(null, null, 1, null, offset, 5, 0);
  
  schedule.scheduleJob(dailyRule, function(){
    saveDailyHistory();
  });
  
  schedule.scheduleJob(weeklyRule, function(){
    saveWeeklyHistory();
  });
  
  schedule.scheduleJob(monthlyRule, function(){
    saveDailyHistory();
  });  
  
  var saveMonthlyHistory = function (done) {
    saveHistory('totalTradeVolume', "month", function() {
      saveHistory('totalValueSent', "month", function() {
        saveHistory('totalNetworkValue', "month", function() {  
          winston.info("finished cacheing monthly historical metrics");  
          if(done) done();
        });    
      });
    });  
  };
  
  var saveWeeklyHistory = function (done) {
    saveHistory('totalTradeVolume', "week", function() {
      saveHistory('totalValueSent', "week", function() {
        saveHistory('totalNetworkValue', "week", function() {  
          winston.info("finished cacheing daily historical metrics"); 
          if (done) done();    
        });    
      });
    });
  }
  
  var saveDailyHistory = function (done) {
    saveHistory('totalTradeVolume', "day", function() {
      saveHistory('totalValueSent', "day", function() {
        saveHistory('totalNetworkValue', "day", function() {  
          winston.info("finished cacheing daily historical metrics"); 
          if (done) done();    
        });    
      });
    });
  }
  
  saveMonthlyHistory(function(){
    saveWeeklyHistory(function(){
      saveDailyHistory(function(){
        winston.info("finished cacheing historical metrics");  
      });
    });
  });
};
