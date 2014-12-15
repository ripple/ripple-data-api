var env    = process.env.NODE_ENV || "production",
  DBconfig = require('../db.config.json')[env],
  config   = require('../deployment.environments.json')[env];

var fs     = require('fs');
var _      = require('lodash');
var moment = require('moment');
var tools  = require('../api/utils');

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

DEBUG = true;
CACHE = false;

db = require('../api/library/couchClient')({
  url : DBconfig.protocol+
    '://' + DBconfig.username + 
    ':'   + DBconfig.password + 
    '@'   + DBconfig.host + 
    ':'   + DBconfig.port + 
    '/'   + DBconfig.database,
});

var tradeVolume = require("../api/library/metrics/tradeVolume");
var rows = [];

var end    = moment.utc().startOf("day");
var start  = moment.utc(end).subtract(180, "day");
var time   = moment.utc(end).subtract(1, "day");

var length = 0; 
while(time.diff(start)>=0) { 
  var fn = get(time, end, length);
  console.log(time.format(), end.format());
  setTimeout(fn, length*500); 
  
  time.subtract(1, "day");
  end.subtract(1, "day");
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
  tradeVolume({
    ex : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
    startTime : moment.utc(start),
    endTime   : moment.utc(end),
    
  }, function (err, res){
    //console.log(res);
    
    if (err) {
      console.log(err, length, rows.length);
      length--;
      
    } else {
      console.log(index);
      if (!rows[0]) {
        var header = ["startTime", "totalVolume", "count", "XRPrate"];
        res.components.forEach(function(c){
          var prefix = getHeaderPrefix(c);
          header.push(prefix + "-volume");
          header.push(prefix + "-count");
          header.push(prefix + "-rate");
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
    }
    
    if (rows.length===length+1) {
      var csvStr = _.map(rows, function(row){
        return row.join(', ');
      }).join('\n');
      
      fs.writeFile("./metrics/results/tradeVolume.csv", csvStr, function(err) {
        if (err) console.log(err);
        else console.log(length);
      });       
    }
  });
}


function getHeaderPrefix (c) {
  var baseIssuer    = tools.getGatewayName(c.base.issuer);
  var counterIssuer = tools.getGatewayName(c.counter.issuer); 
  
  if (c.base.issuer    && !baseIssuer)    baseIssuer    = c.base.issuer;
  if (c.counter.issuer && !counterIssuer) counterIssuer = c.counter.issuer;
  
  return c.base.currency + (baseIssuer ? '.' + baseIssuer : '') + '/' +
    c.counter.currency + (counterIssuer ? '.' + counterIssuer : '');
}


