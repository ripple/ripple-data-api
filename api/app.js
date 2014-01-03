var winston = require('winston'),
  moment = require('moment'),
  _ = require('lodash'),
  async = require('async'),
  clone = require('clone'),
  express = require('express'),
  ripple = require('ripple-lib'),
  app = express(),
  config = require('./apiConfig.json'),
  db = require('nano')('http://' + config.couchdb.username + 
    ':' + config.couchdb.password + 
    '@' + config.couchdb.host + 
    ':' + config.couchdb.port + 
    '/' + config.couchdb.database),
  gatewayList = require('./gateways.json');
  // TODO find permanent location for gateways list
  // should the gateways json file live in couchdb?

var DATEARRAY = ['YYYY', '-MM', '-DD', 'THH', ':mm', ':ssZZ'],
  DATEFORMAT = DATEARRAY.join('');

var apiHandlers = {
  'offersexercised': offersExercisedHandler,
  'accountscreated': accountsCreatedHandler,
  'gatewaycapitalization': gatewayCapitalizationHandler,
  'exchangerates': exchangeRatesHandler,
  'gettransaction': getTransactionHandler,
  'numaccounts': numAccountsHandler
};

// TODO handle hot wallets

// enable CORS
var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.send(200);
    }
    else {
      next();
    }
};
app.use(allowCrossDomain);

// TODO use express.json() instead of bodyParser
app.use(express.bodyParser());

// general api route handler
app.post('/api/*', function(req, res){

  var path = req.path.slice(5),
    apiRoute;
  
  if (path.indexOf('/') !== -1) {
  
    apiRoute = path.slice(0, path.indexOf('/')).toLowerCase();
  
  } else {
  
    apiRoute = path.toLowerCase();
  
  }

  if (apiHandlers[apiRoute]) {

    // winston.info('Calling apiHandler for apiRoute: ' + apiRoute);
    apiHandlers[apiRoute](req, res);

  } else {

    var availableRoutes = _.map(Object.keys(apiHandlers), function(route){
      return '/api/' + route + '/';
    });
    res.send(404, 'Sorry, that API route doesn\'t seem to exist. Available paths are: ' + availableRoutes.join(', ') + '\n');
  
  }

});

/**
 *  getTransaction gets a transaction corresponding to a particular account and invoice ID
 *  
 *  expects req.body to have:
 *  {
 *    account: 'rvY...',
 *    invoice: 'FFCB7F17E98F456193129D48DA39D54800000000000000000000000000000000'
 *  }
 */
 // TODO add more functionality
function getTransactionHandler( req, res ) {

  if (req.body.account && ripple.UInt160.is_valid(req.body.account) && req.body.invoice) {

    db.view('account_tx', 'transactionsByAccountAndInvoice', {key: [req.body.account, req.body.invoice]}, function( err, couchRes ){

      if (couchRes.rows.length >= 1) {
        res.send({ txExists: true, inLedger: couchRes.rows[0].value[0], TxnSignature: couchRes.rows[0].value[1] });
        return;
      } else {
        res.send({ txExists: false });
        return;
      }

    });

  } else {
    // TODO add more functionality to this
    res.send(500, { error: 'please specify an account and invoice ID to get the transaction details'});
    return;
  }
}


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
function gatewayCapitalizationHandler( req, res ) {

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
      return { address: nameOrAddress };
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
                  newResults.push(tempRow)
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
              pair.results[index] = {
                openTime: moment(row.key.slice(2)).format(),
                open: lastPeriodClose,
                delta: 0 - row.value,
                close: lastPeriodClose - row.value
              };
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








// TODO
/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, broken down by the given time increment
 *
 *  expects req.body to have:
 *  {
 *    currencies: [{currency: "XRP"}, {currency: "USD", issuer: "Bitstamp"}, ...]
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    timeIncrement: (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "all"
 *  }
 */
function exchangeRatesHandler( req, res ) {
  res.send(404, 'Oops! This API route is still under development, try again soon.\n');
}







/**
 *  offersExercised returns reduced or individual 
 *  trade-level data about trades that were executed
 *
 *  expects req.body to have:
 *  {
 *    base: {currency: "XRP"},
 *    trade: {currency: "USD", issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
 *    
 *    descending: true/false, // optional, defaults to true
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    reduce: true/false, // optional, defaults to true
 *    timeIncrement: (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    
 *    format: (either 'json', 'json_verbose', 'csv') // optional, defaults to 'json'
 *  }
 */
function offersExercisedHandler( req, res ) {
 
  var viewOpts = {};

  winston.info('req.body: ' + JSON.stringify(req.body));

  if (!req.body.base || !req.body.trade) {
    res.send(500, { error: 'please specify base and trade currencies' });
    return;
  }

  // parse base currency details
  var baseCurr;
  if (!req.body.base.issuer) {
    if (req.body.base.currency === 'XRP') {
      baseCurr = ['XRP'];
    } else {
      res.send(500, { error: 'must specify issuer for all currencies other than XRP' });
      return;
    }
  } else if (req.body.base.issuer && ripple.UInt160.is_valid(req.body.base.issuer)) {
    baseCurr = [req.body.base.currency.toUpperCase(), req.body.base.issuer];
  } else {
    var baseGatewayAddress = gatewayNameToAddress(req.body.base.issuer, req.body.base.currency.toUpperCase());
    if (baseGatewayAddress) {
      baseCurr = [req.body.base.currency.toUpperCase(), baseGatewayAddress];
    } else {
      winston.error('invalid base currency issuer: ' + req.body.base.issuer);
      res.send(500, { error: 'invalid base currency issuer: ' + req.body.base.issuer });
      return;
    }
  }

  // parse trade currency details
  var tradeCurr;
  if (!req.body.trade.issuer) {
    if (req.body.trade.currency === 'XRP') {
      tradeCurr = ['XRP'];
    } else {
      res.send(500, { error: 'must specify issuer for all currencies other than XRP' });
      return;
    }
  } else if (req.body.trade.issuer && ripple.UInt160.is_valid(req.body.trade.issuer)) {
    tradeCurr = [req.body.trade.currency.toUpperCase(), req.body.trade.issuer];
  } else {
    var tradeGatewayAddress = gatewayNameToAddress(req.body.trade.issuer, req.body.trade.currency.toUpperCase());
    if (tradeGatewayAddress) {
      tradeCurr = [req.body.trade.currency.toUpperCase(), tradeGatewayAddress];
    } else {
      winston.error('invalid trade currency issuer: ' + req.body.trade.issuer);
      res.send(500, { error: 'invalid trade currency issuer: ' + req.body.trade.issuer });
      return;
    }
  }

  // parse startTime and endTime
  var startTime, endTime;

  if (!req.body.startTime && !req.body.endTime) {

    startTime = moment.utc().subtract('days', 30);
    endTime = moment.utc();

  } else if (req.body.startTime && req.body.endTime && moment(req.body.startTime).isValid() && moment(req.body.endTime).isValid()) {

    if (moment(req.body.startTime).isBefore(moment(req.body.endTime))) {
      startTime = moment.utc(req.body.startTime);
      endTime = moment.utc(req.body.endTime);
    } else {
      endTime = moment.utc(req.body.startTime);
      startTime = moment.utc(req.body.endTime);
    }

  } else {

    if (!req.body.startTime) {
      winston.error('invalid startTime: ' + req.body.startTime);
      res.send(500, { error: 'invalid startTime: ' + req.body.startTime });
    }

    if (!moment(req.body.startTime).isValid()) {
      winston.error('invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt());
      res.send(500, { error: 'invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt() });
    }

    if (!req.body.endTime) {
      winston.error('invalid endTime: ' + req.body.endTime);
      res.send(500, { error: 'invalid endTime: ' + req.body.endTime });
    }

    if (!moment(req.body.endTime).isValid()) {
      winston.error('invalid endTime: ' + req.body.endTime + ' is invalid at: ' + moment(req.body.endTime).invalidAt());
      res.send(500, { error: 'invalid endTime: ' + req.body.endTime + ' is invalid at: ' + moment(req.body.endTime).invalidAt() });
    }

    return;

  }

  // handle descending/non-descending query
  if (!req.body.hasOwnProperty('descending') || req.body.descending === true) {
    viewOpts.descending = true;

    // swap startTime and endTime if results will be in descending order
    var tempTime = startTime;
    startTime = endTime;
    endTime = tempTime;

  }

  // set startkey and endkey for couchdb query
  viewOpts.startkey = [tradeCurr, baseCurr].concat(startTime.toArray().slice(0,6));
  viewOpts.endkey = [tradeCurr, baseCurr].concat(endTime.toArray().slice(0,6));

  // set reduce option
  if (!req.body.hasOwnProperty('reduce')) {
    viewOpts.reduce = true;
  } else {
    viewOpts.reduce = (req.body.reduce === true);
  }

  // determine the group_multiple from the timeMultiple field
  if (viewOpts.reduce === true && req.body.timeMultiple) {
    viewOpts.group_multiple = req.body.timeMultiple;
  } else {
    viewOpts.group_multiple = 1;  // default to no multiple of time increment
  }

  // determine the group_level from the timeIncrement field
  if (viewOpts.reduce === true && req.body.timeIncrement) {
    var inc = req.body.timeIncrement.toLowerCase().slice(0, 2),
      levels = ['ye', 'mo', 'da', 'ho', 'mi', 'se']; // shortened to accept 'yearly' or 'min' as well as 'year' and 'minute'
    if (inc === 'al') {
      viewOpts.group = false;
    } else if (inc === 'no') {
      viewOpts.reduce = false;
    } else if (inc === 'we') {
      viewOpts.group_multiple = viewOpts.group_multiple * 7; // multiply by days in a week
      viewOpts.group_level = 3 + 2; // set group_level to day
    } else if (levels.indexOf(inc)) {
      viewOpts.group_level = 3 + levels.indexOf(inc);
    } else {
      viewOpts.group_level = 3 + 2; // default to day
    } 
  } else {
    // TODO handle incorrect options better
    viewOpts.group = false; // default to day
  }

  winston.info('viewOpts:' + JSON.stringify(viewOpts));


  db.view("transactions", "offersExercised", viewOpts, function(err, couchRes){
    if (err) {
      winston.error('Error with request: ' + err);
      return;
      // TODO send error messages to api querier
    }

    winston.info('Got ' + couchRes.rows.length + ' rows');
    winston.info(JSON.stringify(couchRes.rows));

    // prepare results to send back
    var resRows = [],
      headerRow = [
        'startTime', 
        'baseCurrVolume', 
        'tradeCurrVolume', 
        'numTrades', 
        'openPrice', 
        'closePrice', 
        'highPrice', 
        'lowPrice', 
        'vwavPrice'
      ];

    resRows.push(headerRow);

    couchRes.rows.forEach(function(row){

      resRows.push([
        (row.key ? moment.utc(row.key.slice(2)).format(DATEFORMAT) : moment.utc(row.value.openTime).format(DATEFORMAT)),
        row.value.curr2Volume,
        row.value.curr1Volume,
        row.value.numTrades,
        row.value.open,
        row.value.close,
        row.value.high,
        row.value.low,
        row.value.volumeWeightedAvg
        ]);
    });

    // default should be filled by web form but default to day just in case
    var timeMultiple = 1;  
    
    // use the time multiple value from web form to format grouping of results
    if (viewOpts.group_multiple) {
      timeMultiple = viewOpts.group_multiple;
    }

    // data structures for processing rows
    var tabledRowCount = 0, newElementCount = 0;
    var tabledRows = [];

    couchRes.rows.forEach(function(element, index, array) {

      /*
      winston.info('Couch result Index: ' + index);
      winston.info(element.value.curr2Volume);
      winston.info(element.value.curr1Volume);
      winston.info(element.value.numTrades);
      winston.info(element.value.open);
      winston.info(element.value.close);
      winston.info(element.value.high);
      winston.info(element.value.low);
      winston.info(element.value.volumeWeightedAvg);
      */

      if ((index % timeMultiple) === 0) {

        // if this is not the first row processed
        if (index !== 0) {
          // increment variable used for counting and indexing rows in table
          tabledRowCount = tabledRowCount + 1;
        }

        // create a new row if at boundary
        tabledRows[tabledRowCount] = [];

        // reset index for storage into new row
        newElementCount = 0;
      }
      // store row to be grouped
      tabledRows[tabledRowCount][newElementCount] = element;

      // increment variable used for counting and indexing row elements
      newElementCount = newElementCount + 1;
    });

    // data structures for grouping results 
    groupedRows = [];
    var groupedOpenTime, groupedBaseCurrVolume, groupedTradeCurrVolume, groupedNumTrades,
        groupedOpenPrice, groupedClosePrice, groupedHighPrice, groupedLowPrice, groupedVwavPrice, groupedVwavNumerator, groupedVwavDenominator;
 
    tabledRows.forEach(function(element, index, array) {
      //winston.info('New row index: ' + index);

      element.forEach(function(e, i, a) {
        /*
        winston.info('Inner new row index: ' + i);
        winston.info(e);
        winston.info(e.value.curr2Volume);
        winston.info(e.value.curr1Volume);
        winston.info(e.value.numTrades);
        winston.info(e.value.open);
        winston.info(e.value.close);
        winston.info(e.value.high);
        winston.info(e.value.low);
        winston.info(e.value.volumeWeightedAvg);
        */

        // if this is first column
        if (i === 0) {
          // set initial values for each group
          groupedClosePrice = e.value.close;
          groupedBaseCurrVolume = 0;
          groupedTradeCurrVolume = 0;
          groupedNumTrades = 0;
          groupedHighPrice = 0;
          groupedLowPrice = Number.MAX_VALUE;
          groupedVwavPrice = 0;
          groupedVwavNumerator = 0;
          groupedVwavDenominator = 0;
        }
        // SUM: base currency volume
        groupedBaseCurrVolume = parseFloat(groupedBaseCurrVolume) + parseFloat(e.value.curr2Volume);

        // SUM: trade currency volume
        groupedTradeCurrVolume = parseFloat(groupedTradeCurrVolume) + parseFloat(e.value.curr1Volume);

        // SUM: number trades
        groupedNumTrades = parseFloat(groupedNumTrades) + parseFloat(e.value.numTrades);

        // LAST: open price
        groupedOpenPrice = e.value.open;

        // LAST: open time
        groupedOpenTime = (e.key ? moment.utc(e.key.slice(2)).format(DATEFORMAT) : moment.utc(e.value.openTime).format(DATEFORMAT));

        // MAX: high price
        groupedHighPrice = Math.max(groupedHighPrice, parseFloat(e.value.high));

        // MIN: low price
        groupedLowPrice = Math.min(groupedLowPrice, parseFloat(e.value.low));

        // regenerate volume weighted average price numerator, defined as sum of trade volume multiplied by VWAP
        groupedVwavNumerator = groupedVwavNumerator + e.value.volumeWeightedAvg * e.value.curr1Volume;

        // regenerate volume weighted average price denominator, defined as sum of trade volume
        groupedVwavDenominator = groupedVwavDenominator + e.value.curr1Volume;
      });

      // regenerate volume weighted average price statistics over entire group
      if (groupedVwavDenominator === 0) {
        // don't divide by zero, set result to zero if denominator value is zero
        groupedVwavPrice = 0;
      } else {
        // recalculate volume weighted average price over entire group
        groupedVwavPrice = groupedVwavNumerator / groupedVwavDenominator;
      }

      // create grouped result based on processed group of rows
      groupedRows.push([groupedOpenTime, groupedBaseCurrVolume, groupedTradeCurrVolume, groupedNumTrades, groupedOpenPrice, groupedClosePrice, groupedHighPrice, groupedLowPrice, groupedVwavPrice]);
    });

    // present results to user based on the specified start & end times 
    if (moment(req.body.startTime).isBefore(moment(req.body.endTime))) {
      groupedRows = groupedRows.reverse();
    }

    // add header row to results
    groupedRows.unshift(headerRow);

    // handle format option
    if (!req.body.format || req.body.format === 'json') {

      // TODO include time sent?
      res.send(groupedRows);

    } else if (req.body.format === 'csv') {

      var csvStr = _.map(groupedRows, function(row){
        return row.join(', ');
      }).join('\n');

      // display output grouped by timeMultiple
      res.end(csvStr);

    } else if (req.body.format === 'json_verbose') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().valueOf();

      apiRes.rows = _.map(couchRes.rows, function(row){

        // reformat rows
        return {
          openTime: (row.key ? moment.utc(row.key.slice(2)).format(DATEFORMAT) : moment.utc(row.value.openTime).format(DATEFORMAT)),
          baseCurrVol: row.value.curr2Volume,
          tradeCurrVol: row.value.curr1Volume,
          numTrades: row.value.numTrades,
          openPrice: row.value.open,
          closePrice: row.value.close,
          highPrice: row.value.high,
          lowPrice: row.value.low,
          vwavPrice: row.value.volumeWeightedAvg
        };

      });

      res.json(apiRes);

    } else {
      // TODO handle incorrect input
      winston.error('incorrect format: ' + req.body.format);

    }

  });

}


/**
 *  numAccounts returns the total number of accounts that existed
 *  in each time period, as well as the number of accounts created in that period
 *
 *  expects:
 *  {
 *    time: (any momentjs-readable data) // optional, defaults to now
 *
 *    // if time is not used you can use the following options
 *    timeIncrement: (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "all"
 *    startTime: (any momentjs-readable date), // optional
 *    endTime: (any momentjs-readable date), // optional
 *    descending: true/false, // optional, defaults to true
 *    format: 'json', 'csv', or 'json_verbose'
 *  }
 */
function numAccountsHandler( req, res ) {

  var numGenesisAccounts = 136,
    viewOpts = {};

  if (req.body.time || !(req.body.timeIncrement || req.body.startTime || req.body.endTime)) {

    var time = moment.utc(req.body.time);
    if (!time || !time.isValid()) {
      time = moment.utc();
    }
    viewOpts.endkey = time.toArray().slice(0,6);
    viewOpts.reduce = true;
    viewOpts.group = false;

    db.view('accounts', 'accountsCreated', viewOpts, function(err, couchRes){
      if (err) {
        res.send(500, { error: err });
        return;
      }

      if (couchRes.rows && couchRes.rows.length > 0) {
        var numAccounts = parseInt(couchRes.rows[0].value, 10);
        res.send({totalAccounts: numAccounts, accountsCreated: numAccounts});
        return;
      }
    });

  } else {

    // TODO add support for other features

    res.send(500, 'Sorry, currently this API only supports the time feature, try again soon.\n');
    return;

  }

}

/**
 *  accountsCreated returns the number of accounts created per time increment
 *  expects req.body to have:
 *  {
 *    timeIncrement: (any of the following: "all", "year", "month", "day", "hour", "minute", "second") // optional, defaults to "day"
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    descending: true/false, // optional, defaults to true
 *    format: 'json', 'csv', or 'json_verbose'
 *  }
 */
function accountsCreatedHandler( req, res ) {

  var viewOpts = {};

  // parse startTime and endTime
  // TODO handle incorrect startTime/endTime values
  var startTime, endTime;
  if (!req.body.startTime && !req.body.endTime) {
    // default
    startTime = moment.utc().subtract('days', 30);
    endTime = moment.utc();
  } else if (moment(req.body.startTime).isBefore(moment(req.body.endTime))) {
    startTime = moment.utc(req.body.startTime);
    endTime = moment.utc(req.body.endTime);
  } else {
    endTime = moment.utc(req.body.startTime);
    startTime = moment.utc(req.body.endTime);
  } 

  // handle descending/non-descending query
  if (!req.body.hasOwnProperty('descending') || req.body.descending === true) {
    viewOpts.descending = true;

    // swap startTime and endTime if results will be in descending order
    var tempTime = startTime;
    startTime = endTime;
    endTime = tempTime;
  }

  // set startkey and endkey for couchdb query
  viewOpts.startkey = startTime.toArray().slice(0,6);
  viewOpts.endkey = endTime.toArray().slice(0,6);

  // always reduce
  viewOpts.reduce = true;

  // determine the group_level from the timeIncrement field
  if (req.body.timeIncrement) {
    var inc = req.body.timeIncrement.toLowerCase(),
      levels = ['year', 'month', 'day', 'hour', 'minute', 'second'];
    if (inc === 'all') {
      viewOpts.group = false;
    } else if (levels.indexOf(inc)) {
      viewOpts.group_level = 1 + levels.indexOf(inc);
    } else {
      viewOpts.group_level = 1 + 2; // default to day
    }
  } else {
    // TODO handle incorrect options better
    viewOpts.group_level = 1 + 2; // default to day
  }

  winston.info('viewOpts: ' + JSON.stringify(viewOpts));

  db.view('accounts', 'accountsCreated', viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      return;
      // TODO send error messages to api querier
    }

    winston.info('Got ' + couchRes.rows.length + ' rows');
    winston.info(JSON.stringify(couchRes.rows));


    // prepare results to send back
    var resRows = [],
      headerRow = [
        'time', 
        'accountsCreated'
      ];

    resRows.push(headerRow);

    couchRes.rows.forEach(function(row){
      resRows.push([
        (row.key ? moment.utc(row.key).format(DATEFORMAT) : ''),
        row.value
        ]);
    });

    // handle format option
    if (!req.body.format || req.body.format === 'json') {

      // TODO include time sent?
      res.send(resRows);

    } else if (req.body.format === 'csv') {

      var csvStr = _.map(resRows, function(row){
        return row.join(', ');
      }).join('\n');

      // TODO make this download instead of display
      res.setHeader('Content-disposition', 'attachment; filename=offersExercised.csv');
      res.setHeader('Content-type', 'text/csv');
      res.charset = 'UTF-8';
      res.end(csvStr);

    } else if (req.body.format === 'json_verbose') {

      // send as an array of json objects
      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().valueOf();

      apiRes.rows = _.map(couchRes.rows, function(row){

        // reformat rows
        return {
          openTime: (row.key ? moment.utc(row.key.slice(2)).format(DATEFORMAT) : moment.utc(row.value.openTime).format(DATEFORMAT)),
          accountsCreated: row.value
        };

      });

      res.json(apiRes);

    } else {
      // TODO handle incorrect input
      winston.error('incorrect format: ' + req.body.format);

    }

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

app.use(express.static('public'));
app.listen(config.port);
winston.info('Listening on port ' + config.port);


