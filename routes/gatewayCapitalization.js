var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  async     = require('async');

/**
 *  gatewayCapitalization returns the total capitalization (outstanding balance)
 *  of the specified gateways, in the specified currencies, over the given time range.
 *  
 *  If no currencies are specified it will return data on each of the currencies
 *  the given gateway(s) deal in. If no gateways are specified it will return
 *  data on each of the gateways that deal in the given currencies.
 *
 *  Available options are:
 *  {
 *    gateway: ('Bitstamp' or 'rvY...'),
 *    currency: 'USD',
 *
 *    OR
 *
 *    gateways: ['bitstamp', 'ripplecn', ...]
 *    currencies: ['USD', 'BTC', ...]
 *    
 *    // the following options are optional
 *    // by default it will return the gateway's current balance
 *    startTime: (any momentjs-readable date),
 *    endTime: (any momentjs-readable date),
 *    timeIncrement: (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // defaults to 'all'
 *    timeMultiple: positive integer, defaults to 1
 *  }
 */
function gatewayCapitalization( req, res ) {

  var gateways = [],
    currencies = [],
    gatewayCurrencyPairs = [];

  // Parse gateways
  if (typeof req.body.gateway === 'string') {

    var gateway = parseGateway(req.body.gateway);
    if (gateway) {
      gateways.push(gateway);
    } else {
      res.send(500, { error: 'invalid or unknown gateway: ' + req.body.gateway });
      return;
    } 

  } else if (typeof req.body.gateways === 'object') {

    req.body.gateways.forEach(function(gateway){
      var parsedGateway = parseGateway(gateway);
      if (parsedGateway) {
        gateways.push(parsedGateway);
      } else {
        res.send(500, { error: 'invalid or unknown gateway: ' + gateway });
        return;
      }
    });

  }

  function parseGateway (nameOrAddress) {
    // Check if gateway is a name or an address
    if (ripple.UInt160.is_valid(nameOrAddress)) {

      var gatewayName = getGatewayName(nameOrAddress);
      if (gatewayName !== '') {
        return parseGateway(gatewayName)
      } else {
        return { address: nameOrAddress };        
      }

    } else if (gatewayNameToAddress(nameOrAddress)){
      var gateway = {
        name: nameOrAddress, 
        address: gatewayNameToAddress(nameOrAddress)
      },
      hotwallets = getHotWalletsForGateway(nameOrAddress);

      if (hotwallets.length > 0) {
        gateway.hotwallets = hotwallets;
      }

      return gateway;
    } else {
      return null;
    }
  }

  // Parse currencies
  if (typeof req.body.currency === 'string') {
    currencies.push(req.body.currency.toUpperCase());
  } else if (typeof req.body.currencies === 'object') {
    req.body.currencies.forEach(function(currency){
      currencies.push(currency.toUpperCase());
    });
  }


  // Get gateway/currency pairs to query CouchDB for
  if (gateways.length > 0 && currencies.length > 0) {
    gateways.forEach(function(gateway){
      currencies.forEach(function(currency){
        var pair = { 
          address: gateway.address,
          currency: currency
        };
        if (gateway.name) {
          pair.name = gateway.name;
        }
        if (gateway.hotwallets && gateway.hotwallets.length > 0) {
          pair.hotwallets = gateway.hotwallets;
        }
        gatewayCurrencyPairs.push(pair);
      });
    });
  } else if (gateways.length > 0 && currencies.length === 0) {

    if (_.every(gateways, function(gateway){ return gateway.name; })) {
      gateways.forEach(function(gateway){
        getCurrenciesForGateway(gateway.name).forEach(function(currency){
          gatewayCurrencyPairs.push({
            address: gateway.address,
            currency: currency,
            name: gateway.name,
            hotwallets: gateway.hotwallets
          });
        });
      });
    } else {
      res.send(500, { error: 'please specify currencies or use gateway names instead of accounts' });
      return;
    }

  } else if (gateways.length === 0 && currencies.length > 0) {

    currencies.forEach(function(currency){
      getGatewaysForCurrency(currency).forEach(function(gateway){
        gatewayCurrencyPairs.push({
          address: gateway.address,
          currency: currency,
          name: gateway.name,
          hotwallets: getHotWalletsForGateway(gateway.name)
        });
      });
    });

  } else {
    res.send(500, { error: 'please specify at least one gateway and/or at least one currency'});
    return;
  }
  
  // Parse start and end times
  var startTime, 
    endTime;

  if (req.body.startTime) {
    
    if (!moment(req.body.startTime).isValid()) {
      res.send(500, { error: 'invalid startTime: ' + req.body.startTime + ', please provide a Moment.js readable timestamp'});
      return;
    }

    startTime = moment(req.body.startTime);
  }

  if (req.body.endTime) {
      
    if (!moment(req.body.endTime).isValid()) {
      res.send(500, { error: 'invalid endTime: ' + req.body.endTime + ', please provide a Moment.js readable timestamp'});
      return;
    }

    endTime = moment(req.body.endTime);
  }

  if (startTime && endTime) {
    if (endTime.isBefore(startTime)) {
      var tempTime = startTime;
      startTime = endTime;
      endTime = tempTime;
    }
  } else if (startTime) {
    endTime = moment();
  } else if (endTime) {
    startTime = endTime;
    endTime = moment();
  } else {
    startTime = moment(0);
    endTime = moment(99999999999999);    
  }

  if (req.body.descending) {
    var tempTime = startTime;
      startTime = endTime;
      endTime = tempTime;
  }


  // Parse timeIncrement and timeMultiple
  var group,
    group_level,
    group_multiple;
  if (typeof req.body.timeMultiple === 'number') {
    group_multiple = req.body.timeMultiple;
  } else {
    group_multiple = 1;
  }

  if (req.body.timeIncrement) {
    var inc = req.body.timeIncrement.toLowerCase().slice(0, 2),
      levels = ['ye', 'mo', 'da', 'ho', 'mi', 'se']; // shortened to accept 'yearly' or 'min' as well as 'year' and 'minute'
    
    if (inc === 'al') {

      group = false;

    } else if (inc === 'we') {

      group_multiple = group_multiple * 7; // multiply by days in a week
      group_level = 2; // set group_level to day

    } else if (levels.indexOf(inc) !== -1) {

      group_level = levels.indexOf(inc);

    } else {

      group = false;
    } 
  } else {

    // TODO handle incorrect options better
    group = false;
  }



  async.mapLimit(gatewayCurrencyPairs, 10, function(pair, asyncCallbackPair){

    // Setup CouchDB view options
    var viewOpts = {
      startkey: [pair.address, pair.currency].concat(startTime.toArray().slice(0,6)),
      endkey: [pair.address, pair.currency].concat(endTime.toArray().slice(0,6)),
      reduce: true
    };
    if (group) {
      viewOpts.group = group;
    }
    if (group_level) {
      // +3 to account for 1-based indexing in CouchDB and 
      // startkey having the [pair.address, pair.currency] first
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
        startkey: [pair.address, pair.currency],
        endkey: viewOpts.startkey,
        group: false
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

        // Get hotwallet balances
        if (!pair.hotwallets) {
          pair.hotwallets = [];
        }
        async.map(pair.hotwallets, function(hotwallet, asyncCallbackHotwallet){

          var hotwalletViewOpts = {
            // using pair.address here to set keys creates consistency AND reveals Bitstamp's hot wallet
            //startkey: [pair.address, pair.currency, hotwallet].concat(startTime.toArray().slice(0,6)),
            //endkey: [pair.address, pair.currency, hotwallet].concat(endTime.toArray().slice(0,6)),
            startkey: [pair.gateway, pair.currency, hotwallet].concat(startTime.toArray().slice(0,6)),
            endkey: [pair.gateway, pair.currency, hotwallet].concat(endTime.toArray().slice(0,6)),
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
              hotwallet.rows.forEach(function(hotwalletRow){

                var pairRowIndex = _.findIndex(pair.results, function(pairRow) {
                  return pairRow.key === hotwalletRow.key;
                });

                if (pairRowIndex !== -1) {
                  pair.results[pairRowIndex].value = pair.results[pairRowIndex].value - hotwalletRow.value.balanceChange;
                  console.log('subtracted ' + pair.name + '\'s hotwallet balance of ' + hotwalletRow.value.balanceChange + ' from account balance for final balance of ' + pair.results[pairRowIndex].value);
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
            pair.results.forEach(function(row, index){
              if (row.key) {
                pair.results[index] = [moment(row.key.slice(2)).valueOf(), lastPeriodClose];
              }
              lastPeriodClose = lastPeriodClose - row.value;
            });

          asyncCallbackPair(null, pair);
        });

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

/** HELPER FUNCTIONS **/

/**
 *  gatewayNameToAddress translates a given name and, 
 *  optionally, a currency to its corresponding ripple address or
 *  returns null
 */
 function gatewayNameToAddress( name, currency ) {

  var gatewayAddress = null;

  _.each(gatewayList, function(entry){

    if (entry.name.toLowerCase() === name.toLowerCase()) {
    
      if (currency) {

        _.each(entry.accounts, function(acct){

          if (acct.currencies.indexOf(currency) !== -1) {
            gatewayAddress = acct.address;
          }
        });

      } else {
         gatewayAddress = entry.accounts[0].address;
      }
    }

  });

  return gatewayAddress;

 }


/**
 *  getGatewaysForCurrency takes a currency and returns
 *  an array of gateways that issue that currency
 *  returns an empty array if the currency is invalid
 */
function getGatewaysForCurrency( currName ) {

  var issuers = [];
  gatewayList.forEach(function(gateway){
    gateway.accounts.forEach(function(acct){
      if (acct.currencies.indexOf(currName.toUpperCase()) !== -1) {
        issuers.push({
          account: acct.address,
          name: gateway.name
        });
      }
    });
  });

  return issuers;

}

function getGatewayName(address) {
  for (var g = 0; g < gatewayList.length; g++) {

    if (_.find(gatewayList[g].accounts, function(account) {return account.address === address;})) {
      return gatewayList[g].name;
    }
  }

  return '';
}

/**
 *  getCurrenciesForGateway returns the currencies that that gateway handles
 */
function getCurrenciesForGateway( name ) {
  var currencies = [];
  gatewayList.forEach(function(gateway){
    if (gateway.name.toLowerCase() === name.toLowerCase()) {
      gateway.accounts.forEach(function(account){
        currencies = currencies.concat(account.currencies);
      });
    }
  });
  return currencies;
}

function getHotWalletsForGateway( name ) {
  var hotwallets = [];
  gatewayList.forEach(function(gateway){
    if (gateway.name.toLowerCase() === name.toLowerCase()) {
      hotwallets = gateway.hotwallets;
    }
  });
  return hotwallets;
}


module.exports = gatewayCapitalization;