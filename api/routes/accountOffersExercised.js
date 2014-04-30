var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');

/*
 * accountOffersExercised:
 * 
 * list of offers excercised for a given account. providing a time increment or reduce option
 * results in a count of transactions for the given interval or time period
 *
 * request:
 *
 * {
 *  account       : "r9aZAsv...." //required
 *  startTime     : (any momentjs-readable date), // optional, defaults to 30 days before end time
 *  endTime       : (any momentjs-readable date), // optional, defaults to now
 *  descending    : true/false, // optional, defaults to true
 *  limit         : limit the number of responses, ignored if time increment is set
 *  offset        : offset by n transactions for pagination
 *  format        : 'json', 'csv'  // optional
 * }
 * 
 * response (default): 
 * 
 * [
 *  [
 *    "baseCurrency",
 *    "baseIssuer",
 *    "baseAmount",
 *    "counterCurrency",
 *    "counterIssuer",
 *    "counterAmount",
 *    "type",
 *    "rate",
 *    "counterparty",
 *    "time",
 *    "txHash",
 *    "ledgerIndex"
 *  ],
 *  [
 *    "BTC",
 *    "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
 *    0.44114996160201914,
 *    "XRP",
 *    null,
 *    19220.903827,
 *    "buy",
 *    0.00002295157218269451,
 *    "rsYxmEL..........",
 *    "2014-03-18T22:15:40+00:00",
 *    "531025.....",
 *    5592404
 *  ],
 *    ....
 *    ....
 *    ....
 * ]
 * 
 * 
 * response (json):
 * 
 * {
 *  "account": "rZiaVx2.........",
 *  "timeRetrieved": "2014-04-04T19:13:45+00:00",
 *  "startTime": "2014-01-01T18:00:00+00:00",
 *  "endTime": "2015-01-10T18:00:00+00:00",
 *  "results": [
 *    {
 *      "base": {
 *        "currency": "BTC",
 *        "issuer": "rJHygWcTLVpSXkowott6kzgZU6viQSVYM1",
 *        "amount": 0.0008549999942999986
 *      },
 *      "counter": {
 *        "currency": "XRP",
 *        "issuer": null,
 *        "amount": 37.449374
 *      },      
 *      "type": "buy",
 *      "rate": 0.00002283082206661181,
 *     "counterparty": "rPEZy......",
 *      "time": "2014-03-18T22:15:40+00:00",
 *      "txHash": "531025E..........",
 *      "ledgerIndex": 5592404
 *    },
 *    ...
 *    ...
 *    ...
 *  ]
 * }
 * 
 * response (reduce = true):
 * 
 * [
 *  ["time", "count"],
 *  ["2014-03-18T22:00:00+00:00", 32],
 *  ["2014-04-03T16:00:00+00:00", 1],
 *  ["2014-04-03T18:00:00+00:00", 2],
 *  ...
 *  ...
 *  ...
 * ]
 * 
 * 
 * 
   curl -H "Content-Type: application/json" -X POST -d '{
    "account" : "r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV",
    "format" : "json",
    "timeIncrement" : "hour"
      
  }' http://localhost:5993/api/accountOffersExercised
    
  curl -H "Content-Type: application/json" -X POST -d '{
    "account" : "r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV",
    "format" : "json",
    "startTime" : "jan 1, 2014 10:00 am",
    "endTime"   : "jan 10, 2015 10:00 am"
    
  }' http://localhost:5993/api/accountOffersExercised
  
  curl -H "Content-Type: application/json" -X POST -d '{
    "account" : "rN9U9jLxBQq6N4bREdG2UxxoAXPGiSANfc",
    "timeIncrement" : "day"
      
  }' http://localhost:5993/api/accountOffersExercised
      
  curl -H "Content-Type: application/json" -X POST -d '{
    "account" : "rN9U9jLxBQq6N4bREdG2UxxoAXPGiSANfc"
    
  }' http://localhost:5993/api/accountOffersExercised
  
  curl -H "Content-Type: application/json" -X POST -d '{
    "account" : "rN9U9jLxBQq6N4bREdG2UxxoAXPGiSANfc",
    "limit"  : 5,
    "offset" : 10,
    "format" : "csv"
    
  }' http://localhost:5993/api/accountOffersExercised
  
 * 
 * 
 */

  
function accountOffersExercised (params, callback) {
  
  var account = params.account,
    limit     = params.limit  ? parseInt(params.limit, 10)  : 0,
    offset    = params.offset ? parseInt(params.offset, 10) : 0,
    maxLimit  = 500,
    viewOpts  = {},
    intervalCount;
  
      
  if (!account) return callback("Please specify an account");  
  if (!limit || limit>maxLimit) limit = maxLimit;
  
  //Parse start and end times
  var range = tools.parseTimeRange(params.startTime, params.endTime, params.descending);
  
  if (range.error) return callback(range.error);  
  if (!range.end)   range.end   = moment.utc();
  if (!range.start) range.start = moment.utc(range.end).subtract(30, "days");
  
  // set startkey and endkey for couchdb query
  viewOpts.startkey = [account].concat(range.start.toArray().slice(0,6));
  viewOpts.endkey   = [account].concat(range.end.toArray().slice(0,6));
  
  if (params.descending) viewOpts.descending = true;
  
  //parse time increment and time multiple
  var results = tools.parseTimeIncrement(params.timeIncrement);  

  //set reduce option only if its false
  if (results.group_level) viewOpts.group_level = results.group_level + 2;
  else if (!params.reduce) viewOpts.reduce      = false;
  
  if (viewOpts.reduce===false) {
    if (limit  && !isNaN(limit))  viewOpts.limit = limit;
    if (offset && !isNaN(offset)) viewOpts.skip  = offset;
  }
  
  if (results.group !== false) {
    intervalCount = tools.countIntervals(range.start, range.end, results.name);
    if (intervalCount>maxLimit) {
      return callback("Please specify a smaller time range or larger interval");
    }
  }
  
  viewOpts.stale = "ok"; //dont wait for updates
  
  db.view('accountOffersExercised', 'v1', viewOpts, function(error, couchRes) {
    
    if (error) return callback ('CouchDB - ' + error);
    
    handleResponse(couchRes.rows);
  });
  
/*
 * handleResponse - format the data according to the requirements
 * of the request and return it to the caller.
 * 
 */  
  function handleResponse (rows) {
    
    if (params.format === 'json') {
      
      // send as an array of json objects
      var apiRes = {};
      apiRes.account       = account;
      apiRes.startTime     = range.start.format();
      apiRes.endTime       = range.end.format();
      apiRes.timeIncrement = params.timeIncrement;
      apiRes.results       = [];
    
      if (viewOpts.reduce === false) {
        
        rows.forEach(function(d){
          apiRes.results.push({
            base : {
              currency : d.value[0],
              issuer   : d.value[1],
              amount   : d.value[2]
            },
            
            counter : {
              currency : d.value[3],
              issuer   : d.value[4],
              amount   : d.value[5]
            },
            
            type         : d.value[6],
            rate         : d.value[7],
            counterparty : d.value[8],
            time         : moment.utc(d.value[9]).format(),
            txHash      : d.value[10],
            ledgerIndex : parseInt(d.id, 10)
          });
        });
      
      } else {

        rows.forEach(function(d){
          apiRes.results.push({
            time  : moment.utc(d.key.slice(1)).format(),
            count : d.value
          });  
        });  
      }
      
      if (params.timeIncrement) apiRes.timeIncrement = params.timeIncrement;   
      return callback(null, apiRes);
      
    } else {
      var data = [], keys = {}, nKeys = 0;
      
      if (viewOpts.reduce === false) {
        for (var i=0; i<rows.length; i++) {
          rows[i].value[9]  = moment.utc(rows[i].value[9]).format(), 
          rows[i].value[11] = parseInt(rows[i].id, 10) //ledger_index
          rows[i] = rows[i].value;
        }        
        
        rows.unshift(["baseCurrency",  "baseIssuer",  "baseAmount", 
                   "counterCurrency", "counterIssuer", "counterAmount",
                   "type", "rate",   "counterparty",
                   "time", "txHash", "ledgerIndex"
                   ]);
        
        
      } else {
        for (var j=0; j<rows.length; j++) {
          rows[j] = [
            moment.utc(rows[j].key.slice(1)).format(),
            rows[j].value
          ]
        }
        
        rows.unshift(["time","count"]);
      }
      
  
      if (params.format === 'csv') {

        var csvStr = _.map(rows, function(row){
          return row.join(', ');
        }).join('\n');
  
        // provide output as CSV
        return callback(null, csvStr);


      } else {
        //no format or incorrect format specified
        return callback(null, rows);      
      }    
    }  
  }
}

module.exports = accountOffersExercised;