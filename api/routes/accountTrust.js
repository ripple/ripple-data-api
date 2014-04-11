var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
/*
 * 
  curl -o gateways.csv -H "Content-Type: application/json" -X POST -d '{
      
    }' http://localhost:5993/api/accountTrust
 * 
 */
function accountTrust (params, callback) {
  var viewOpts = {};
  
  //var issuer = params.issuer ? params.issuer : ""; 
  //if (!issuer) return res.send(500, "issuer is required"); 
  
  //viewOpts.startkey : [issuer].concat(moment.utc().subtract(24, "hours").toArray().slice(0,6)),
  //viewOpts.endkey   : [issuer].concat(moment.utc().toArray().slice(0,6)),
  viewOpts.group_level = 1;
  
  db.view('accountTrust', 'v1', viewOpts, function(error, couchRes){
    
    if (error) return callback ('CouchDB - ' + error);
    
    var accounts = [];
        
    couchRes.rows.forEach(function(row){
      if (!row.value[0]) return;
      accounts.push([row.key[0], row.value[0]]);
    });
    
    accounts.sort(function(a,b){return b[1]-a[1]});
    var csvStr = _.map(accounts, function(row){
      return row.join(', ');
    }).join('\n');

    // provide output as CSV
    return callback(csvStr);  
  });
    
}


module.exports = accountTrust;