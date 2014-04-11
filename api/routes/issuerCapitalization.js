var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  async     = require('async'),
  util      = require('util'),
  tools     = require('../utils');

/**
 *  issuerCapitalization returns the total capitalization (outstanding balance)
 *  of a specified issuer & specified currency pair, over the given time range.
 *  
 *  Available options are:
 *  {
 *    currencies: [
 *      {
 *        issuer: ('Bitstamp' or 'rvY...'),
 *        currency: ('USD', 'BTC', etc)
 *      },{
 *        issuer: ('Bitstamp' or 'rvY...'),
 *        currency: ('USD', 'BTC', etc)
 *      },
 *            .
 *            .
 *            .
 *    
 * 
 *    // the following options are optional
 *    // by default it will return the gateway's current balance
 * 
 *    startTime     : (any momentjs-readable date),
 *    endTime       : (any momentjs-readable date),
 *    timeIncrement : (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // defaults to 'all'
 *  }
 * 
 * 
 
  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Mar 5, 2014 10:00 am",
      "endTime"   : "Mar 6, 2014 10:00 am",
      "currencies" : [{"currency"  : "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}],
      "timeIncrement" : "month"
      
    }' http://localhost:5993/api/issuer_capitalization

  curl -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Mar 5, 2011 10:00 am",
      "endTime"   : "Mar 6, 2015 10:00 am",
      "currencies" : [{"currency"  : "USD", "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}],
      "timeIncrement" : "month"
      
    }' http://localhost:5993/api/issuer_capitalization 
 
 */
function issuerCapitalization(params, callback) {

  var error, currencies = [];

//validate incoming currencies
  if (Array.isArray(params.currencies)) {
    
    params.currencies.forEach(function(c){

      if (c.issuer) {
        c.name       = tools.getGatewayName(c.issuer);
        c.hotwallets = tools.getHotWalletsForGateway(c.name);
        currencies.push(c);

      } else {
        error = 'issuer is required: '+JSON.stringify(c);
        return;
      } 
    });
    
    if (error) return callback(error);
    
  } else return callback('please specify at least one issuer-currency pair');
  
//Parse start and end times
  var time = tools.parseTimeRange(params.startTime, params.endTime, params.descending);
  
  if (time.error)               return callback(time.error);
  if (!time.start || !time.end) return callback("startTime and endTime are required.");

      
  var startTime = time.start;
  var endTime   = time.end;

//Parse timeIncrement and timeMultiple
  var results        = tools.parseTimeIncrement(params.timeIncrement);
  var group          = results.group;
  var group_level    = results.group_level;
  var group_multiple = results.group_multiple;
  
  if (typeof params.timeMultiple === 'number') {
    group_multiple = group_multiple ? group_multiple*params.timeMultiple : params.timeMultiple;
  } else {
    group_multiple = 1;
  }


//get capitalization data for each currency
  async.mapLimit(currencies, 10, function(c, asyncCallbackPair){

    // Setup CouchDB view options
    var viewOpts = {
      startkey : [c.currency+"."+c.issuer].concat(startTime.toArray().slice(0,6)),
      endkey   : [c.currency+"."+c.issuer].concat(endTime.toArray().slice(0,6)),
      reduce   : true
    };
    
    if (group) viewOpts.group = group;
    if (group_level) {
      // +3 to account for 1-based indexing in CouchDB and 
      // startkey having the [c.issuer, c.currency] first
      viewOpts.group_level = group_level + 2; 
    }

      viewOpts.stale = "ok"; //dont wait for updates
      
    // Query CouchDB for changes in trustline balances
    db.view('currencyBalances', 'v1', viewOpts, function(error, trustlineRes){
      
      if (error) return asyncCallbackPair("CouchDB error: " + error);

      c.results = trustlineRes.rows;
      
      var initialValueViewOpts = {
        startkey : [c.currency+"."+c.issuer],
        endkey   : viewOpts.startkey,
        group    : false,
        stale    : "ok"
      };

      
      db.view('currencyBalances', 'v1', initialValueViewOpts, function(error, initValRes){
        
        if (error) return asyncCallbackPair("CouchDB error: " + error);
        
        var startCapitalization = 0;
        if (initValRes && initValRes.rows && initValRes.rows.length > 0) {
          startCapitalization = 0 - initValRes.rows[0].value;
        }
        
        if (!viewOpts.group_level) {
          if (c.results.length) {
            c.amount = startCapitalization - c.results[0].value; //add inverted value
            delete c.results;
          }
          
          asyncCallbackPair(null, c);
          return;  
        }
        
        // Format and add startCapitalization data to each row
        if (c.results) {       
          var lastPeriodClose = startCapitalization;
          var firstTime = c.results.length ? moment.utc(c.results[0].key.slice(1)) : null;
           
          for (var i=0; i<c.results.length; i++) {
            lastPeriodClose -= c.results[i].value; //add inverted negative value
            var time = c.results[i+1] ? moment.utc(c.results[i+1].key.slice(1)) : endTime;
            c.results[i] = [time.format(), lastPeriodClose];
          }

        if (firstTime) c.results.unshift([firstTime.format(), startCapitalization]);
          
/*       
          c.results.forEach(function(row, index){
            lastPeriodClose -= row.value; //add inverted negative value
            
            if (row.key) {
              //console.log(moment.utc(row.key.slice(2)).format(), lastPeriodClose, row.value);
              c.results[index] = [moment.utc(row.key.slice(2)).valueOf(), lastPeriodClose];
            } 
            
          });
*/          
         
        } else winston.info("No results for currency:", util.inspect(c));
        
        //if (c.results.length) console.log(c.name, c.issuer, c.results[c.results.length-1]);
        asyncCallbackPair(null, c);
/*        
        async.map(c.hotwallets, function(hotwallet, asyncCallbackHotwallet){

          var hotwalletViewOpts = {
            startkey: [c.issuer, c.currency, hotwallet].concat(startTime.toArray().slice(0,6)),
            endkey: [c.issuer, c.currency, hotwallet].concat(endTime.toArray().slice(0,6)),
            reduce: true
          };
          if (group) {
            hotwalletViewOpts.group = group;
          }
          if (group_level) {
            hotwalletViewOpts.group_level = group_level;
          }


          db.view('trustlines', 'trustlineBalancesBetweenAccounts', hotwalletViewOpts, asyncCallbackHotwallet);

        }, function(error, hotwalletResults){
          if (error) {
            asyncCallbackPair(error);
            return;
          }

          // Subtract hotwallet balances from totals
          if (hotwalletResults) {
            hotwalletResults.forEach(function(hotwallet){

              //winston.info(util.inspect(hotwallet));
              //winston.info(util.inspect(c));

              hotwallet.rows.forEach(function(hotwalletRow){
                winston.info("hotwalletrow: " + JSON.stringify(hotwalletRow));

                var hotwalletBalance = hotwalletRow.value.latestBalance + hotwalletRow.value.balanceChange;
                var rowIndex = _.findIndex(c.results, function(row) {
                  return row.key === hotwalletRow.key;
                });

                if (rowIndex !== -1) {
                  var accountBalance = c.results[rowIndex].value;

                  c.results[rowIndex].value = c.results[rowIndex].value - hotwalletBalance;
                  console.log('subtracted ' + c.name + '\'s hotwallet balance of ' 
                    + hotwalletBalance + ' from account balance of ' 
                    + accountBalance + ' for final balance of ' + c.results[rowIndex].value);
                }
              });
            });
          }

          // Group rows using group_multiple
          if (group_multiple && group_multiple > 1) {
            var newResults = [],
              tempRow;
            c.results.forEach(function(row, index){
              if (index % group_multiple === 0) {
                if (tempRow) {
                  newResults.push(tempRow);
                }

                tempRow = row;
              }
              tempRow.value += row.value;
            });

            c.results = newResults;
          }

          // Format and add startCapitalization data to each row
          var lastPeriodClose = startCapitalization;

          if (c.results) {          
            c.results.forEach(function(row, index){
              if (row.key) {
                c.results[index] = [moment(row.key.slice(2)).valueOf(), lastPeriodClose];
              }
              lastPeriodClose = lastPeriodClose - row.value;
            });
          } else {
            winston.error("currency results does not exist");
          }
          asyncCallbackPair(null, c);
        });
       */

      });
    });
  }, function(error, results){
    if (error) return callback(error);

    return callback(null, results);
  });
}

module.exports = issuerCapitalization;