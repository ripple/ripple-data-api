var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
/*
 * 
  curl -H "Content-Type: application/json" -X POST -d '{
      
    }' http://localhost:5993/api/accountTrust
 * 
 */
function accountTrust (params, callback) {

  var account = params.account,
    limit     = params.limit  ? parseInt(params.limit, 10)  : 0,
    offset    = params.offset ? parseInt(params.offset, 10) : 0,
    maxLimit  = 5,
    viewOpts  = {};
  
  if (!limit || limit>maxLimit) limit = maxLimit;
  
  //var issuer = params.issuer ? params.issuer : ""; 
  //if (!issuer) return res.send(500, "issuer is required"); 
  
  //viewOpts.startkey : [issuer].concat(moment.utc().subtract(24, "hours").toArray().slice(0,6)),
  //viewOpts.endkey   : [issuer].concat(moment.utc().toArray().slice(0,6)),
  
  viewOpts.group_level = 1;
  if (limit  && !isNaN(limit))  viewOpts.limit = limit;
  if (offset && !isNaN(offset)) viewOpts.skip  = offset;
  
  console.log(viewOpts);
  
  db.view('accountTrust', 'v1', viewOpts, function(error, couchRes){
    
    if (error) return callback ('CouchDB - ' + error);
    
    var accounts = [];
        
    couchRes.rows.forEach(function(row){
      accounts.push([row.key[0], row.value[0], row.value[1]]);
    });
    
    accounts.sort(function(a,b){return b[1]-a[1]});
    var csvStr = "account, incoming, outgoing\n";
    csvStr += _.map(accounts, function(row){
      return row.join(', ');
    }).join('\n');

    // provide output as CSV
    return callback(null, csvStr);  
  });
    
}


module.exports = accountTrust;