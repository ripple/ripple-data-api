var env    = process.env.NODE_ENV || "staging",
  DBconfig = require('../db.config.json')[env],
  config   = require('../deployment.environments.json')[env],
  StatsD   = require('node-dogstatsd').StatsD;
  
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

DEBUG    = true;
datadog  = new StatsD();

var db = require('../api/library/couchClient')({
  url : DBconfig.protocol+
    '://' + DBconfig.username + 
    ':'   + DBconfig.password + 
    '@'   + DBconfig.host + 
    ':'   + DBconfig.port + 
    '/'   + DBconfig.database,
});


var batchSize = 20000,
  limit = 0,
  total = 0,
  accounts = {};

var options = {
  startkey : moment.utc("June 21, 2014 0:00+0:00").toArray().slice(0,6),
  endkey   : moment.utc("july 22, 2014 0:00+0:00").toArray().slice(0,6),
  reduce   : false,
  limit    : batchSize+1,
  stale    : 'ok',
}

function getTransactions(options, callback) {
  //console.log(options);
  
  db.view('transactionStats', 'v1', options, function(error, couchRes){
    if (error) return callback(error);
    if (!couchRes.rows) return callback({error:couchRes});
    //console.log(couchRes.rows);
    var next  = couchRes.rows.pop(); //remove last for pagination
    var count = 0;
    //console.log(next);

    //diff = hd.end();
    //console.log(diff.after.size);
    //console.log(diff.change.size);
    
    for(var i=0; i<couchRes.rows.length; i++) {
      var row = couchRes.rows[i];
      if (options.txHash) {
        if (row.value[3] != options.txHash) {
          //console.log('skip');
          continue;
        } else {
          options.txHash = null;
          //start from here
        } 
      }
      
      count++;
      var address = row.value[1];
      
      
      //if (!accounts[address]) accounts[address] = 1;
      //else accounts[address]++;
      
      if (!accounts[address]) accounts[address] = {};
      
      if (!accounts[address][row.value[0]]) accounts[address][row.value[0]] = 1;
      else accounts[address][row.value[0]]++;
      
      if (!accounts[address].total) accounts[address].total = 1;
      else accounts[address].total++;
      
    }
    
        
    total += count;
    
    console.log("count:", total);
    
    if (!count) {
      return callback(null);
    }
    
    if (limit && total >= limit) return callback(null);
    if (limit && total+batchSize+1>limit) options.limit = limit-total+1;
    
    options.startkey       = next.key;
    options.txHash         = next.value[3];
    options.startkey_docid = next.id;
     
    setImmediate(function(){
      getTransactions(options, function(err){
        if (error) return callback(error);
   
        return callback(null);
      });
    });
  });    
}

getTransactions(options, function(err, res){
  if (err) return console.log(err);  
  
  var rows   = [['account','Total','Payment','OfferCreate','OfferCancel','TrustSet','AccountSet','SetRegularKey']];
  //var rows = [['account','count']];
  
  for(var address in accounts) {
    rows.push([
      address, 
      accounts[address].total,
      accounts[address].Payment || 0,
      accounts[address].OfferCreate || 0,
      accounts[address].OfferCancel || 0,
      accounts[address].TrustSet || 0,
      accounts[address].AccountSet || 0,
      accounts[address].SetRegularKey || 0
    ]);
  }
  
  rows.sort(function(a,b){return b[1]-a[1]});
  
  var csvStr = _.map(rows, function(row){
    return row.join(', ');
  }).join('\n');
  
  fs.writeFile("results/activeUsers.csv", csvStr, function(err) {
    if (err) console.log(err);
    else console.log((rows.length-1) + " Accounts");
  }); 
});

