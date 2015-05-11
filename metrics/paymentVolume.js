 var env   = process.env.NODE_ENV || "production";
var HBase  = require('../api/library/hbase/hbase-client');
var config = require('../deployment.environments.json')[env];
var utils  = require('../api/library/utils');
var fs     = require('fs');
var _      = require('lodash');
var moment = require('moment');

var interval = 'month';
var count    = 3;

statsd = {
  increment : function(){},
  histogram : function(){},
  timing    : function(){}
};

fs.mkdir("./metrics/results",function(e){
    if(!e || (e && e.code === 'EEXIST')){
        //do something with contents
    } else {
        //debug
        console.log(e);
    }
});

//global hbase client
hbase = new HBase(config.hbase);
DEBUG = true;
CACHE = false;

var pv  = require("../api/library/metrics/paymentVolume");
var rows = [];

var end = moment.utc().startOf(interval).add(1, interval);
var start = moment.utc(end).subtract(count, interval);
var time = moment.utc(end).subtract(1, interval);

var length = 0;
while(time.diff(start)>=0) {
  var fn = get(time, end, length);
  console.log(time.format(), end.format());
  setTimeout(fn, length*500);

  time.subtract(1, interval);
  end.subtract(1, interval);
  length++;
}

function get (start, end, index) {
  var s = moment.utc(start);
  var e = moment.utc(end);
  var i = index;
  return function () {
    getStats (s, e, i);
  }
}


function getStats (start, end, index) {

  pv({
    startTime : start,
    endTime   : end,
    interval  : interval,
    no_cache  : true

  }, function (err, res) {
    if (err) {
      console.log(err, length, rows.length);
      length--;
      return;
    }

    utils.getConversion({
      currency : 'USD',
      issuer   : 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
      start    : moment.utc(start),
      end      : moment.utc(end),
      interval : interval === 'week' ? '7day' : '1' + interval
    }, function (err, rate) {
      if (err) {
        console.log(err, length, rows.length);
        length--;
        return;
      }

      finalize(rate, res, index);
    });
  });
}

function finalize(rate, res, index) {
  res.total = 0;
  res.components.forEach(function(c) {

    c.convertedAmount *= rate;
    c.rate      = c.rate ? rate / c.rate : 0;
    res.total += c.convertedAmount;
  });

  res.exchangeRate = rate;
  console.log(index);

  if (!rows[0]) {
    var header = ["startTime", "totalVolume", "count", "XRPrate"];
    res.components.forEach(function(c){
      if (c.issuer) {
        header.push(c.currency+"/"+c.issuer+"-volume");
        header.push(c.currency+"/"+c.issuer+"-count");
        header.push(c.currency+"/"+c.issuer+"-rate");
      } else {
        header.push(c.currency+"-volume");
        header.push(c.currency+"-count");
        header.push(c.currency+"-rate");
      }
    });
    rows[0] = header;
  }

  var row = [
    res.startTime,
    res.total,
    res.count,
    res.exchangeRate
  ];

  res.components.forEach(function(c){
    row.push(c.convertedAmount || 0);
    row.push(c.count || 0);
    row.push(c.rate || 0);
  });

  rows.push(row);

  if (rows.length==length+1) {
    var csvStr = _.map(rows, function(row){
      return row.join(', ');
    }).join('\n');

    fs.writeFile("./metrics/results/paymentVolume.csv", csvStr, function(err) {
      if (err) console.log(err);
      else console.log(length);
      process.exit();
    });
  }
}
