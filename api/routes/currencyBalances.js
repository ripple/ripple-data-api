var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
/**
 *  currencyBalances: 
 * 
 *  Balancces of all accounts that hold the specified currency at the
 *  specified moment in time.
 *
 *  request : 
 *
 * {
 *    time      : "2014-03-13T20:39:26+00:00",  // time of desired snapshot, defaults to now
 *    currency  : (XRP, USD, BTC, etc.),        // optional, defaults to XRP        
 *    issuer    : "rAusZ...."                   // optional, required if currency != XRP
 *    format    : (json,csv)                    // optional
 *    total     : true/false                    // optional, setting to true will return a total only
 * }
 *
 * response (default):
 * 
 * [
 *  ["account", "balance", "last"],
 *  ['rajDteRmFXXs8ALEhfPpwMZy7QuW3o7MtE', -256.1618571876749, '2014-03-18T18:23:50.000Z'],
 *  ['rp7NJKXLFsc2AUSeJNSvxxmzy3x4QxrKQu', -0.737359, '2014-03-18T18:23:50.000Z'],
 *  ...
 *  ...
 *  ...
 * ]
 * 
 * 
 * response (json): 
 *
 * {
 *    time     : "2014-03-13T20:39:26+00:00",         //time of desired snapshot, defaults to now
 *    currency : "USD",                              
 *    issuer   : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
 *    total    : 399201.2456  //cumulative total of balances
 *    balances : [
 *      {
 *        account : "rX451sd1a....",
 *        balance : 2004.1003,
 *        last    : '2014-03-18T18:23:50.000Z'
 *      },
 *      {
 *        account : "rX451sd1a....",
 *        balance : 14.116742,
 *        last    : '2014-03-18T12:13:20.000Z'
 *      },
 *      ...
 *      ...
 *      ...
 *    ]
 * }
 *
  curl -H "Content-Type: application/json" -X POST -d '{
      "currency": "USD", 
      "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
      
    }' http://localhost:5993/api/currencyBalances
    
 curl -H "Content-Type: application/json" -X POST -d '{
    "currency": "USD", 
    "issuer": "rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK",
    "format" : "json",
    "total"  : true
    
  }' http://localhost:5993/api/currencyBalances
 
 
 curl -H "Content-Type: application/json" -X POST -d '{
    "currency": "USD", 
    "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "total"  : true
    
  }' http://localhost:5993/api/currencyBalances   

 curl -H "Content-Type: application/json" -X POST -d '{
    "time"   : "2013 jan 2",
    "total"  : true
    
  }' http://localhost:5993/api/currencyBalances   
        
 * 
 */

function currencyBalances (params, callback) {
  
  //currently not working
  if (1) return callback('This API is unavailable');
  
  var viewOpts  = {};
  var currency  = params.currency || "XRP";
  var issuer    = params.issuer;
  var time      = params.time ? moment.utc(params.time) : moment.utc();
  var totalOnly = params.total ? true : false;
  
  if (currency.toUpperCase() != "XRP" && !issuer)
    return callback('exchange issuer is required');
  else if (currency == "XRP" && issuer)
    return callback('XRP cannot have an issuer');
    
  var key = issuer ? currency+"."+issuer : currency;
  
  viewOpts.startkey = [key];
  viewOpts.endkey   = [key].concat(time.toArray().slice(0,6));
  viewOpts.reduce   = false; //get indivdual balances
  viewOpts.stale    = "ok";  //dont wait for updates
  
  console.log(viewOpts);
  db.view_with_list('currencyBalances', 'v1', 'balancesByAccount', viewOpts, function(error, balances) {
    if (error) return callback ('CouchDB - ' + error);
    
    handleResponse(balances);
  });
  
/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (balances) {
    
    if (params.format === 'json') {
      
      // send as an array of json objects
      var apiRes = {
        time     : time.format(), 
        currency : currency,
        issuer   : issuer,
        total    : 0,
      }
      
      if (totalOnly) {
        balances.forEach(function(d){
          apiRes.total += d[1];     
        });   
        
      } else {
        apiRes.balances = [];
        balances.forEach(function(d){
          apiRes.total += d[1];
          
          if (!totalOnly) {
            apiRes.balances.push({
              account : d[0],
              balance : d[1],
              last    : d[2],
            });
          }
        });
      }
     
      return callback(null, apiRes);
      
    } else {
      
      if (totalOnly) {
        var total = 0;
        balances.forEach(function(d){
          total += d[1];   
        });
        
        return callback(null, total.toString());
      }
      
      balances.unshift(["account","balance","last"]);
  
      if (params.format === 'csv') {

        var csvStr = _.map(balances, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        return callback(null, csvStr);


      } else {
        //no format or incorrect format specified
        return callback(null, balances);      
      }    
    }  
  }
}

module.exports = currencyBalances;