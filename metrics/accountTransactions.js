var env    = process.env.NODE_ENV || "production",
  DBconfig = require('../db.config.json')[env],
  config   = require('../deployment.environments.json')[env];

var fs   = require('fs'),
  _      = require('lodash'),
  moment = require('moment'),
  StatsD = require('node-dogstatsd').StatsD;
  

datadog = new StatsD(null, null);

fs.mkdir(__dirname + "/results",function(e){
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

var getTransactions = require("../api/routes/accountTransactions");
var rows    = [];
var account  = process.argv[3] || process.argv[2];

if (!account) {
  console.log("please specify an account");  
  return;
}

getTransactions({
  "startTime"  : "Jan 1, 2013 00:00+0:00",
  "endTime"    : moment.utc(),
  "account"    : account,
  "descending" : true,
  'format'     : 'csv'
    
}, function (err, res){
  if (err) return console.log(err);
  
  fs.writeFile(__dirname + "/results/"+account+"-payments.csv", res, function(err) {
    if (err) console.log(err);
    else console.log("saved");
  }); 
  
  
}, true);