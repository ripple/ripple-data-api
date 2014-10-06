var env    = process.env.NODE_ENV || "production",
  DBconfig = require('../db.config.json')[env],
  config   = require('../deployment.environments.json')[env];

var fs   = require('fs'),
  _      = require('lodash'),
  moment = require('moment');

datadog = {
  increment : function(){},
  histogram : function(){},
};

fs.mkdir("results",function(e){
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

var tvs  = require("../api/routes/totalValueSent");
var rows = [];

var end    = moment.utc().startOf("day");
var start  = moment.utc(end).subtract(31, "day"); 
var time   = moment.utc(end).subtract(1, "day");
var length = 0; 
while(time.diff(start)>0) {
  length++;
  console.log(time.format(), end.format());
  
  getStats(time, end, length);
  time.subtract(1, "day");
  end.subtract(1, "day");
}


function getStats (start, end, index) { 
  
  tvs({
    exchange : {currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'},
    startTime : start,
    endTime   : end,
    
  }, function (err, res){
    if (err) {
      console.log(err, length, rows.length);
      length--;
      
    } else { 
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
    }
    
    if (rows.length==length) {
      var csvStr = _.map(rows, function(row){
        return row.join(', ');
      }).join('\n');
      
      fs.writeFile("results/sendVolume.csv", csvStr, function(err) {
        if (err) console.log(err);
        else console.log(rows.length);
      });       
    }
  });
}





