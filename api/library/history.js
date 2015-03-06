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

  if (metric === 'tradeVolume')            fn = require("./metrics/tradeVolume");
  else if (metric === 'transactionVolume') fn = require("./metrics/transactionVolume");
  else if (metric === 'networkValue')      fn = require("./metrics/networkValue");
  else return winston.error("invalid metric");

  if (interval != 'month' &&
      interval != 'week' &&
      interval != 'day') return winston.error('invalid interval');

  next(); //start

  function getStat(callback) {
    if (metric == 'networkValue') params = {
      time    : time,
    }

    else params = {
      startTime : time,
      interval  : interval
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
    saveHistory('tradeVolume', "month", function() {
      saveHistory('transactionVolume', "month", function() {
        saveHistory('networkValue', "month", function() {
          winston.info("finished cacheing monthly historical metrics");
          if(done) done();
        });
      });
    });
  };

  var saveWeeklyHistory = function (done) {
    saveHistory('tradeVolume', "week", function() {
      saveHistory('transactionVolume', "week", function() {
        saveHistory('networkValue', "week", function() {
          winston.info("finished cacheing daily historical metrics");
          if (done) done();
        });
      });
    });
  }

  var saveDailyHistory = function (done) {
    saveHistory('tradeVolume', "day", function() {
      saveHistory('transactionVolume', "day", function() {
        saveHistory('networkValue', "day", function() {
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
