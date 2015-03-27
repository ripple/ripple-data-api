var  _          = require('lodash');
var moment      = require('moment');
var UInt160     = require('ripple-lib').UInt160;
var gatewayList = require('./gateways.json');
var path        = require('path');
var fs          = require('fs');
var assetPath   = path.resolve(__dirname + '/gatewayAssets/');
var files       = fs.readdirSync(assetPath);
var assets      = { };

//prepare assets
files.forEach(function(file) {
  var parts   = file.split('.');
  var gateway = parts.shift();

  if (!gateway) return;

  if (!assets[gateway]) {
    assets[gateway] = [];
  }

  assets[gateway].push(parts.join('.'));
});

//add assets to gateway list
gatewayList.forEach(function(gateway){
  gateway.normalized = gateway.name.toLowerCase().replace(/\W/g, '');
  gateway.assets     = assets[gateway.normalized] || [];
});

exports.getGatewaysByCurrency = function () {
  var results = { };
  gatewayList.forEach(function(gateway){

    if (gateway.status !== 'active') {
      return;
    }

    gateway.accounts.forEach(function(acct){
      for (var currency in acct.currencies) {
        if (!results[currency]) {
          results[currency] = [ ];
        }

        var g = {
          name      : gateway.name,
          account   : acct.address,
          featured  : acct.currencies[currency].featured,
          label     : acct.currencies[currency].label,
          assets    : gateway.assets,
          startDate : gateway.startDate
        }

        results[currency].push(g);
      }
    });
  });

  return results;
};

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
 * getGateway
 * get gateway details
 * from an issuer address
 */

exports.getGateway = function (address) {
  var gateway;
  var name;
  var normalized;

  if (!address) return;

  if (address[0] !== 'r' || !UInt160.is_valid(address)) {
    name    = address.toLowerCase().replace(/\W/g, '');
    address = null;
  }

  for (var i=0; i<gatewayList.length; i++) {
    gateway = gatewayList[i];

    for (var j=0; j<gateway.accounts.length; j++) {

      if (address && gateway.accounts[j].address === address) {
        return gateway;

      } else if (!address) {
        normalized = gateway.name.toLowerCase().replace(/\W/g, '');

        if (name === normalized) {
          return gateway;
        }
      }
    }
  }
};

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
 */

exports.getAlignedTime = function (original, increment, multiple) {
  var time = moment.utc(original); //clone the original
  if (!multiple) multiple = 1;

  increment = increment ? increment.slice(0,3) : null;

  if (increment === 'sec') {
    time.subtract({
      ms      : time.milliseconds(),
      seconds : multiple === 1 ? 0 : time.seconds()%multiple
    });

  } else if (increment === 'min') {
    time.subtract({
      ms      : time.milliseconds(),
      seconds : time.seconds(),
      minutes : multiple === 1 ? 0 : time.minutes()%multiple
    });

  } else if (increment === 'hou') {
    time.subtract({
      ms      : time.milliseconds(),
      seconds : time.seconds(),
      minutes : time.minutes(),
      hours   : multiple === 1 ? 0 : time.hours()%multiple
    });

  } else if (increment === 'day') {

    var days;
    var diff;

    if (multiple === 1) {
      days = 0;

    } else {
      diff = time.diff(moment.utc([2013,0,1]), 'hours')/24;
      if (diff<0) days = multiple - (0 - Math.floor(diff))%multiple;
      else days = Math.floor(diff)%multiple;
    }

    time.subtract({
      ms      : time.milliseconds(),
      seconds : time.seconds(),
      minutes : time.minutes(),
      hours   : time.hours(),
      days    : days
    });

  } else if (increment === 'mon') {
    time.subtract({
      ms      : time.milliseconds(),
      seconds : time.seconds(),
      minutes : time.minutes(),
      hours   : time.hours(),
      days    : time.date()-1,
      months  : multiple === 1 ? 0 : time.months()%multiple
    });
  } else if (increment === 'yea') {
    time.subtract({
      ms      : time.milliseconds(),
      seconds : time.seconds(),
      minutes : time.minutes(),
      hours   : time.hours(),
      days    : time.date()-1,
      months  : time.months(),
      years   : multiple === 1 ? 0 : time.years()%multiple
    });
  }

  return time;
}

exports.formatTime = function(time) {
  if (typeof time === 'number') {
    t = moment.unix(time).utc();
  } else {
    t = moment.utc(time);
  }
  return t.format('YYYYMMDDHHmmss');
};

exports.unformatTime = function(time) {
  var t = [
    parseInt(time.slice(0, 4), 10),     //year
    parseInt(time.slice(4, 6), 10) - 1, //month
    parseInt(time.slice(6, 8), 10),     //day
    parseInt(time.slice(8, 10), 10),    //hour
    parseInt(time.slice(10, 12), 10),   //minute
    parseInt(time.slice(12, 14), 10),   //second
  ]

  return moment.utc(t);
};
