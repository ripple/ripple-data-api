var env    = process.env.NODE_ENV || "staging",
  DBconfig = require('../db.config.json')[env],
  config   = require('../deployment.environments.json')[env];

var fs   = require('fs'),
  _      = require('lodash'),
  moment = require('moment');


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

var getTransactions  = require("../api/routes/accountTransactions");
var rows     = [];
var giveaway = "rMTzGg7nPPEMJthjgEBfiPZGoAM7MEVa1r";

getTransactions({
  "startTime"  : "jan 1, 2013 10:00 am z",
  "endTime"    : "jan 10, 2015 10:00 am z",
  "account"    : giveaway,
  "format"     : "json"
    
}, function (err, res){
  if (err) return console.log(err);
  var accounts = {};
  
  res.transactions.forEach(function(row){
    if (!row.type=='sent')    return;
    if (!row.currency=='XRP') return;
    if (row.amount!=1000) return;
    if (!accounts[row.counterparty]) accounts[row.counterparty] = {amount:0,count:0};

    accounts[row.counterparty].amount += row.amount;
    accounts[row.counterparty].count++;
    
  });
  
  var rows   = [['account','amount','count']];
  
  for(var address in accounts) {
    rows.push([
      address, 
      accounts[address].amount,
      accounts[address].count
    ]);
  }
  
  rows.sort(function(a,b){return b[1]-a[1]});
  
  var csvStr = _.map(rows, function(row){
    return row.join(', ');
  }).join('\n');
  
  fs.writeFile("results/wcg-beta-giveaway.csv", csvStr, function(err) {
    if (err) console.log(err);
    else console.log((rows.length-1) + " Accounts");
  }); 
  
  console.log(csvStr);
}, true);