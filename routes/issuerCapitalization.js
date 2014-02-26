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
 *    pairs: [
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
 *    timeMultiple  : positive integer, defaults to 1
 *  }
 */
function issuerCapitalization( req, res ) {

  var pairs = [];

//validate incoming pairs
  if (Array.isArray(req.body.pairs)) {
    req.body.pairs.forEach(function(pair){

      if (pair.issuer) {
        pair.name       = tools.getGatewayName(pair.issuer);
        pair.hotwallets = tools.getHotWalletsForGateway(pair.name);
        pairs.push(pair);

      } else {
        res.send(500, { error: 'issuer is required: '+JSON.stringify(pair)});
      } 
    });
    
  } else {
    res.send(500, { error: 'please specify at least one issuer-currency pair'});
    return;
  }
  
  
//Parse start and end times
  var results = tools.parseTimeRange(req.body.startTime, req.body.endTime, req.body.descending);
  
  if (results.error) res.send(500, { error: results.error });
  
  var startTime = results.start;
  var endTime   = results.end;

//Parse timeIncrement and timeMultiple
  var results = tools.parseTimeIncrement(req.body.timeIncrement);
  var group          = results.group;
  var group_level    = results.group_level;
  var group_multiple = results.group_multiple;
  
  if (typeof req.body.timeMultiple === 'number') {
    group_multiple = group_multiple ? group_multiple*req.body.timeMultiple : req.body.timeMultiple;
  } else {
    group_multiple = 1;
  }


//get capitalization data for each pair
  async.mapLimit(pairs, 10, function(pair, asyncCallbackPair){

    // Setup CouchDB view options
    var viewOpts = {
      startkey : [pair.issuer, pair.currency].concat(startTime.toArray().slice(0,6)),
      endkey   : [pair.issuer, pair.currency].concat(endTime.toArray().slice(0,6)),
      reduce   : true
    };
    
    if (group) viewOpts.group = group;
    if (group_level) {
      // +3 to account for 1-based indexing in CouchDB and 
      // startkey having the [pair.issuer, pair.currency] first
      viewOpts.group_level = group_level + 3; 
    }

    // Query CouchDB for changes in trustline balances
    db.view('trustlines', 'trustlineBalanceChangesByAccount', viewOpts, function(err, trustlineRes){
      if (err) {
        asyncCallbackPair(err);
        return;
      }

      pair.results = trustlineRes.rows;
      
      var initialValueViewOpts = {
        startkey : [pair.issuer, pair.currency],
        endkey   : viewOpts.startkey,
        group    : false
      };


      db.view('trustlines', 'trustlineBalanceChangesByAccount', initialValueViewOpts, function(err, initValRes){
        if (err) {
          asyncCallbackPair(err);
          return;
        }
        
        var startCapitalization = 0;
        if (initValRes && initValRes.rows && initValRes.rows.length > 0) {
          startCapitalization = 0 - initValRes.rows[0].value;
        }
        

        // Format and add startCapitalization data to each row
        if (pair.results) {       
          var lastPeriodClose = startCapitalization;
          var firstTime = pair.results.length ? moment.utc(pair.results[0].key.slice(2)) : null;
           
          for (var i=0; i<pair.results.length; i++) {
            lastPeriodClose -= pair.results[i].value; //add inverted negative value
            var time = pair.results[i+1] ? moment.utc(pair.results[i+1].key.slice(2)) : endTime;
            pair.results[i] = [time.valueOf(), lastPeriodClose];
          }

        if (firstTime) pair.results.unshift([firstTime.valueOf(), startCapitalization]);
          
/*       
          pair.results.forEach(function(row, index){
            lastPeriodClose -= row.value; //add inverted negative value
            
            if (row.key) {
              //console.log(moment.utc(row.key.slice(2)).format(), lastPeriodClose, row.value);
              pair.results[index] = [moment.utc(row.key.slice(2)).valueOf(), lastPeriodClose];
            } 
            
          });
*/          
         
        } else winston.info("No results for pair:", util.inspect(pair));
        
        if (pair.results.length) console.log(pair.name, pair.issuer, pair.results[pair.results.length-1]);
        asyncCallbackPair(null, pair);
/*        
        async.map(pair.hotwallets, function(hotwallet, asyncCallbackHotwallet){

          var hotwalletViewOpts = {
            startkey: [pair.issuer, pair.currency, hotwallet].concat(startTime.toArray().slice(0,6)),
            endkey: [pair.issuer, pair.currency, hotwallet].concat(endTime.toArray().slice(0,6)),
            reduce: true
          };
          if (group) {
            hotwalletViewOpts.group = group;
          }
          if (group_level) {
            hotwalletViewOpts.group_level = group_level;
          }


          db.view('trustlines', 'trustlineBalancesBetweenAccounts', hotwalletViewOpts, asyncCallbackHotwallet);

        }, function(err, hotwalletResults){
          if (err) {
            asyncCallbackPair(err);
            return;
          }

          // Subtract hotwallet balances from totals
          if (hotwalletResults) {
            hotwalletResults.forEach(function(hotwallet){

              //winston.info(util.inspect(hotwallet));
              //winston.info(util.inspect(pair));

              hotwallet.rows.forEach(function(hotwalletRow){
                winston.info("hotwalletrow: " + JSON.stringify(hotwalletRow));

                var hotwalletBalance = hotwalletRow.value.latestBalance + hotwalletRow.value.balanceChange;
                var pairRowIndex = _.findIndex(pair.results, function(pairRow) {
                  return pairRow.key === hotwalletRow.key;
                });

                if (pairRowIndex !== -1) {
                  var accountBalance = pair.results[pairRowIndex].value;

                  pair.results[pairRowIndex].value = pair.results[pairRowIndex].value - hotwalletBalance;
                  console.log('subtracted ' + pair.name + '\'s hotwallet balance of ' 
                    + hotwalletBalance + ' from account balance of ' 
                    + accountBalance + ' for final balance of ' + pair.results[pairRowIndex].value);
                }
              });
            });
          }

          // Group rows using group_multiple
          if (group_multiple && group_multiple > 1) {
            var newResults = [],
              tempRow;
            pair.results.forEach(function(row, index){
              if (index % group_multiple === 0) {
                if (tempRow) {
                  newResults.push(tempRow);
                }

                tempRow = row;
              }
              tempRow.value += row.value;
            });

            pair.results = newResults;
          }

          // Format and add startCapitalization data to each row
          var lastPeriodClose = startCapitalization;

          if (pair.results) {          
            pair.results.forEach(function(row, index){
              if (row.key) {
                pair.results[index] = [moment(row.key.slice(2)).valueOf(), lastPeriodClose];
              }
              lastPeriodClose = lastPeriodClose - row.value;
            });
          } else {
            winston.error("Pair results does not exist");
          }
          asyncCallbackPair(null, pair);
        });
       */

      });
    });
  }, function(err, results){
    if (err) {
      res.send(500, {error: 'error retrieving data from CouchDB: ' + err});
      return;
    }

    // TODO support different result formats

    res.send(results);
  });

}

module.exports = issuerCapitalization;