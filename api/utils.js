var  _     = require('lodash');
var moment = require('moment');
var gatewayList = require('./gateways.json'); 
 
/**
 *  gatewayNameToAddress translates a given name and, 
 *  optionally, a currency to its corresponding ripple address or
 *  returns null
 */
exports.gatewayNameToAddress = function ( name, currency ) {


  var gatewayAddress = null;

  _.each(gatewayList, function(entry){
   

    if (entry.name.toLowerCase() === name.toLowerCase()) {
    
      if (currency) {

        _.each(entry.accounts, function(acct){

          if (acct.currencies.indexOf(currency) !== -1) {
            gatewayAddress = acct.address;
          }
        });

      } else {
         gatewayAddress = entry.accounts[0].address;
      }
    }

  });

  return gatewayAddress;
}
 

/**
 *  getGatewayName returns the name
 *  of a known gateway that matches the given address
 */ 
exports.getGatewayName = function (address) {
  
  function checkAddress (account) {
    return account.address === address;  
  }
  
  for (var g = 0; g < gatewayList.length; g++) {

    if (_.find(gatewayList[g].accounts, checkAddress)) {
      return gatewayList[g].name;
    }
  }

  return '';
}


/**
 *  getGatewaysForCurrency takes a currency and returns
 *  an array of gateways that issue that currency
 *  returns an empty array if the currency is invalid
 */
exports.getGatewaysForCurrency = function( currName ) {

  var issuers = [];
  gatewayList.forEach(function(gateway){
    gateway.accounts.forEach(function(acct){
      if (acct.currencies.indexOf(currName.toUpperCase()) !== -1) {
        issuers.push({
          account: acct.address,
          name: gateway.name
        });
      }
    });
  });

  return issuers;
}


/**
 *  getCurrenciesForGateway returns the currencies that that gateway handles
 */
exports.getCurrenciesForGateway = function ( name ) {
  var currencies = [];
  gatewayList.forEach(function(gateway){
    if (gateway.name.toLowerCase() === name.toLowerCase()) {
      gateway.accounts.forEach(function(account){
        currencies = currencies.concat(account.currencies);
      });
    }
  });
  return currencies;
}

exports.getHotWalletsForGateway = function( name ) {
  var hotwallets = [];
  gatewayList.forEach(function(gateway){
    if (gateway.name.toLowerCase() === name.toLowerCase()) {
      hotwallets = gateway.hotwallets;
    }
  });
  return hotwallets;
}



exports.parseTimeRange = function (time1, time2, descending) {

  var startTime, endTime, tempTime;

  if (time1) {
    if (!moment(time1).isValid()) {
      return { error: 'invalid startTime: ' + time1 + ', please provide a Moment.js readable timestamp'};
    }

    startTime = moment.utc(time1);
  } 
  
  if (time2) {
    if (!moment(time2).isValid()) {
      return { error: 'invalid endTime: ' + time2 + ', please provide a Moment.js readable timestamp'};
    }

    endTime = moment.utc(time2);
  } 
  
  if (startTime && endTime) {
    if (endTime.isBefore(startTime)) { //swap times
      tempTime  = startTime;
      startTime = endTime;
      endTime   = tempTime;
    } else if (endTime.isSame(startTime)) {
      return { error: 'please provide 2 distinct times'};
    }
  } else if (startTime) {
    endTime = moment.utc();
    
  } else if (endTime) {
    startTime = endTime;
    endTime   = moment.utc();
  } 

  if (descending) {  //swap times
    tempTime  = startTime;
    startTime = endTime;
    endTime   = tempTime;
  }
    
  return {start:startTime, end:endTime};  
}


exports.countIntervals = function (start, end, intervalName, multiple) {
  if (!multiple) multiple = 1;
  
  var diff   = Math.abs(end.diff(start)),
    interval = moment.duration(multiple, intervalName).asMilliseconds();
    
  return diff/interval;
}

exports.parseTimeIncrement = function (inc) {
  var results = {};
  
  if (inc) {
      inc    = inc.toLowerCase().slice(0, 2),
      levels = ['ye', 'mo', 'da', 'ho', 'mi', 'se']; // shortened to accept 'yearly' or 'min' as well as 'year' and 'minute'
      names  = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'];
    if (inc === 'al') {

      results.group = false;
      results.name  = "all";
      
    } else if (inc === 'we') {

      results.group_multiple = 7; // multiply by days in a week
      results.group_level    = 2; // set group_level to day
      results.name = "week";
      
    } else if (levels.indexOf(inc) !== -1) {

      results.group_level = levels.indexOf(inc);
      results.name        = names[results.group_level];
      
    } else {

      results.group = false;
    } 
  } else {

    results.group = false;
  }
  
  return results;
}

/*
 * getAlignedTime - uses the interval and multiple
 * to align the time to a consistent series, such as 9:00, 9:05, 9:10...
 * rather than 9:03, 9:08, 9:13...
 * 
 */ 
exports.getAlignedTime = function (original, increment, multiple) {
  var time = moment.utc(original); //clone the original
  if (!multiple) multiple = 1;

  if (increment=='seconds') {
    time.subtract("seconds", time.seconds()%multiple);   
    
  } else if (increment=='minutes') {
    time.subtract({
      seconds : time.seconds(), 
      minutes : time.minutes()%multiple
    });
          
  } else if (increment=='hours') {
    time.subtract({
      seconds : time.seconds(), 
      minutes : time.minutes(),
      hours   : time.hours()%multiple
    });   
           
  } else if (increment=='days') {
    var days = time.diff(moment([2013,1,1]), 'days')%multiple;
    time.subtract({
      seconds : time.seconds(), 
      minutes : time.minutes(),
      hours   : time.hours(),
      days    : days
    }); 

  } else if (increment=='months') {
    time.subtract({
      seconds : time.seconds(), 
      minutes : time.minutes(),
      hours   : time.hours(),
      days    : time.date()-1,
      months  : time.months()%multiple
    }); 
  } else if (increment=='years') {
    time.subtract({
      seconds : time.seconds(), 
      minutes : time.minutes(),
      hours   : time.hours(),
      days    : time.date()-1,
      months  : time.months(),
      years   : time.years()%multiple
    }); 
  }
  
  return time;    
}
