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
  gateways = require('./gateways.json');
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
// TODO get rid of staleView and replace it with something that routinely pings all of the views

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

    winston.info('Calling apiHandler for apiRoute: ' + apiRoute);
    apiHandlers[apiRoute](req, res);

  } else {

    var availableRoutes = _.map(Object.keys(apiHandlers), function(route){
      return '/api/' + route + '/';
    });
    res.send(404, 'Sorry, that API route doesn\'t seem to exist. Available paths are: ' + availableRoutes.join(', ') + '\n');
  
  }

});

app.get("/api/getTransaction", getTransactionHandler);

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
  req.body = req.query || req.body;
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
 *  of a gateway at a particular moment or over time
 *
 *  expects req.body to have:
 *  {
 *    gateway: ('Bitstamp' or 'rvY...'),
 *    account: // optional, interchangeable with gateway
 *    currencies: 'all' or ['USD', 'BTC', ...] // optional, defaults to 'all'
 *    
 *    format: 'json', 'csv', 'json_verbose'
 *
 *    // the following options are optional
 *    // by default it will return the gateway's current balance
 *    startTime: (any momentjs-readable date),
 *    endTime: (any momentjs-readable date),
 *    timeIncrement: (any of the following: "all", "none", "year", "month", "day", "hour", "minute", "second") // defaults to 'all'
 *    descending: true/false
 *  }
 */
function gatewayCapitalizationHandler( req, res ) {


  var viewOpts = {};

  winston.info(JSON.stringify(req.body));

  // parse gateway
  var gateway = req.body.gateway || req.body.account;
  if (!gateway) {
    res.send(500, { error: 'must specify "gateway" or "account"' });
    return;
  }

  // parse currencies
  var currencies = [];
  if (req.body.currencies && typeof req.body.currencies === 'object') {
    req.body.currencies.forEach(function(curr){
      currencies.push(curr.toUpperCase());
    });
  }

  var gatewayAccounts = [];
  if (ripple.UInt160.is_valid(gateway)) {
    
    gatewayAccounts.push(gateway);

    if (currencies.length === 0) {
      res.send(500, { error: 'please specify the currencies for this account or give a gateway name'});
      return;
    }
  
  } else {
    
    if (!gatewayNameToAddress(gateway)) {
      res.send(500, { error: 'invalid or unknown gateway: ' + gateway } + 
        '.\nAvailable gateways are: ' + gatewayNames.join(', '));
      return;
    }

    if (currencies.length === 0) {
      currencies = getCurrenciesForGateway(gateway);
    }

    currencies.forEach(function(curr){
      var acct = gatewayNameToAddress(gateway, curr);
      if (acct) {
        gatewayAccounts.push(acct);
      }
    });

  }

  winston.info('gatewayAccounts: ' + JSON.stringify(gatewayAccounts));
  winston.info('currencies: ' + JSON.stringify(currencies));


  // parse startTime and endTime
  var startTime, endTime;
  if (req.body.startTime && req.body.endTime && moment(req.body.startTime).isValid() && moment(req.body.endTime).isValid()) {

    if (moment(req.body.startTime).isBefore(moment(req.body.endTime))) {
      startTime = moment.utc(req.body.startTime);
      endTime = moment.utc(req.body.endTime);
    } else {
      endTime = moment.utc(req.body.startTime);
      startTime = moment.utc(req.body.endTime);
    }

  } else {

    if (!moment(req.body.startTime).isValid()) {
      winston.error('invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt());
      res.send(500, { error: 'invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt() });
      return;
    }

    if (!moment(req.body.endTime).isValid()) {
      winston.error('invalid endTime: ' + req.body.endTime + ' is invalid at: ' + moment(req.body.endTime).invalidAt());
      res.send(500, { error: 'invalid endTime: ' + req.body.endTime + ' is invalid at: ' + moment(req.body.endTime).invalidAt() });
      return;
    }

    if (!startTime) {
      startTime = moment(0);
    }

    if (!endTime) {
      endTime = moment();
    }

  }

  // handle descending/non-descending query
  if (!req.body.hasOwnProperty('descending') || req.body.descending === true) {
    viewOpts.descending = true;

    // swap startTime and endTime if results will be in descending order
    var tempTime = startTime;
    startTime = endTime;
    endTime = tempTime;

  }

  // determine the group_level from the timeIncrement field
  if (req.body.timeIncrement) {
    var inc = req.body.timeIncrement.toLowerCase().slice(0, 2),
      levels = ['ye', 'mo', 'da', 'ho', 'mi', 'se']; // shortened to accept 'yearly' or 'min' as well as 'year' and 'minute'
    if (inc === 'al') {
      viewOpts.group = false;
    } else if (inc === 'no') {
      viewOpts.reduce = false;
    } else if (levels.indexOf(inc)) {
      viewOpts.group_level = 3 + levels.indexOf(inc);
    } else {
      viewOpts.group_level = 3 + 2; // default to day
    }
  } else {
    // TODO handle incorrect options better
    viewOpts.group = false; // default to all
  }

  winston.info('viewOpts: ' + JSON.stringify(viewOpts));

  // prepare results to send back
  var resRows = [],
    headerRow = ['time'].concat(currencies);
  resRows.push(headerRow);

  async.map(gatewayAccounts, function(account, asyncCallbackAccount){

    async.map(currencies, function(currency, asyncCallbackCurrency){

      winston.info('account: ' + ' currency: ' + currency);
      winston.info(JSON.stringify(viewOpts));

      var opts = clone(viewOpts);
      opts.startkey = [account, currency].concat(startTime.toArray().slice(0,6));
      opts.endkey = [account, currency].concat(endTime.toArray().slice(0,6));

      winston.info('querying trustlineBalanceChangesByAccount with opts: ' + JSON.stringify(opts));

      db.view('trustlines', 'trustlineBalanceChangesByAccount', opts, function(err, res){
        if (err) {
          asyncCallbackCurrency(err);
        }
        if (res.rows) {
          asyncCallbackCurrency(null, res.rows);
        } else {
          asyncCallbackCurrency(null, null);
        }
      });

    }, function(err, currencyResults){

      if (err) {
        asyncCallbackAccount(err);
        return;
      }

      asyncCallbackAccount(null, currencyResults);

    });

  }, function(err, accountResults){

    console.log(JSON.stringify(accountResults));

    var results = [];

    // TODO format results and send them
    // currencies.forEach(function(currency))

    // TODO subtract hotwallet balances

    res.send(404, 'Oops! This API route is still under development, try again soon.\n');


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
 *    staleView: true/false, // optional, defaults to true
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

  // parse base currency details
  var baseCurr;
  if (!req.body.base.issuer) {
    baseCurr = [req.body.base.currency.toUpperCase()];
  } else if (ripple.UInt160.is_valid(req.body.base.issuer)) {
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
    tradeCurr = [req.body.trade.currency.toUpperCase()];
  } else if (ripple.UInt160.is_valid(req.body.trade.issuer)) {
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

    if (!moment(req.body.startTime).isValid()) {
      winston.error('invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt());
      res.send(500, { error: 'invalid startTime: ' + req.body.startTime + ' is invalid at: ' + moment(req.body.startTime).invalidAt() });
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
    } else if (levels.indexOf(inc)) {
      viewOpts.group_level = 3 + levels.indexOf(inc);
    } else {
      viewOpts.group_level = 3 + 2; // default to day
    } 
  } else {
    // TODO handle incorrect options better
    viewOpts.group_level = 3 + 2; // default to day
  }

  // set stale view option
  if ((!req.body.hasOwnProperty('stale') && !req.body.hasOwnProperty('staleView'))
    || req.body.stale || req.body.staleView) {
    viewOpts.stale = 'update_after';
  }

  winston.info('viewOpts:' + JSON.stringify(viewOpts));

  /**
  // TODO handle multiple issuers, figure out how to combine results

  // async.map for both the trade curr and the base curr
  // combine the results
  // process them as before

  var baseIssuers, tradeIssuers;
  if (baseCurr[0] === 'XRP') {
    baseIssuers = ['XRP'];
  } else if (baseCurr[1]) {
    baseIssuers = [baseCurr[1]];
  } else {
    baseIssuers = getGatewaysForCurrency(baseCurr[0]);
    if (issuers.length === 0) {
      res.send(500, { error: 'This currency: ' + baseCurr[0] + ' is either invalid or not issued by any known gateway.' +
        ' Please change the currency or specify a gateway address.\n'});
      return;
    }
  }

  if (tradeCurr[0] === 'XRP') {
    tradeIssuers = ['XRP'];
  } else if (tradeCurr[1]) {
    tradeIssuers = [tradeCurr[1]];
  } else {
    tradeIssuers = getGatewaysForCurrency(tradeCurr[0]);
    if (issuers.length === 0) {
      res.send(500, { error: 'This currency: ' + tradeCurr[0] + ' is either invalid or not issued by any known gateway.' +
        ' Please change the currency or specify a gateway address.\n'});
      return;
    }
  }



  function queryView( issuer, asyncCallback ) {
  
    if (issuer !== 'XRP') {
      // add issuer to startkey and endkey
      // careful about changing the original object
    }

    db.view("transactions", "offersExercised", viewOpts, asyncCallback);
  }

  */

  // query couchdb multiple times when combining gateways
  db.view("transactions", "offersExercised", viewOpts, function(err, couchRes){
  // db.view("transactions", "offersExercised", viewOpts, function(err, couchRes){

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

    // handle format option
    if (!req.body.format || req.body.format === 'json') {

      // TODO include time sent?
      res.send(resRows);

    } else if (req.body.format === 'csv') {

      var csvStr = _.map(resRows, function(row){
        return row.join(', ');
      }).join('\n');

 
      // TODO make this download instead of display
      //res.setHeader('Content-disposition', 'attachment; filename=offersExercised.csv');
      //res.setHeader('Content-type', 'text/csv');
      //res.charset = 'UTF-8';
      //res.end(csvStr);
 
      winston.info('reversed CSV result, map over rows:\n' + csvStr);
 
      // compress rows based on 'group_multiple'
      var timeMultiple = 1, csvRowCount = 0, newRowCount = 0;
 
      var csvRows = csvStr.split('\n');
      var newRows = [];

      // use the time multiple from web form to group results
      if (req.body.timeMultiple) {
        timeMultiple = req.body.timeMultiple;
      }
 
      csvRows.reverse().forEach(function(row) {
 
        if ((csvRowCount % timeMultiple) === 0) {
 
          newRowCount = newRowCount + 1;
 
          newRows[newRowCount] = [];
          newRows[newRowCount][csvRowCount] = row;
        } else {
          newRows[newRowCount][csvRowCount] = row;
        }
 
        csvRowCount = csvRowCount + 1;
      })
 
      groupedRows = [];
      var groupedTime, groupedBaseCurrVolume, groupedTradeCurrVolume, groupedNumTrades,
          groupedOpenPrice, groupedClosePrice, groupedHighPrice, groupedLowPrice, groupedVwavPrice;
 
      var isFirstRow = true;
 
      newRows.reverse().forEach(function(row) {
 
        if (isFirstRow) {
          isFirstRow = false;
          return;
        }
 
        winston.info("these results will be grouped");
 
        var isFirstElement = true;
 
        row.forEach(function(r) {
          winston.info(r);
 
          line = r.split(", ");
 
          if (isFirstElement) {
 
            // take most recent of group
            groupedTime = line[0];
 
            // take most recent of group
            groupedClosePrice = line[5];
 
            groupedBaseCurrVolume = 0;
            groupedTradeCurrVolume = 0;
            groupedNumTrades = 0;
            groupedHighPrice = 0;
            groupedLowPrice = Number.MAX_VALUE;
          }
 
          // take sum
          groupedBaseCurrVolume = parseFloat(groupedBaseCurrVolume) + parseFloat(line[1]);
 
          // take sum
          groupedTradeCurrVolume = parseFloat(groupedTradeCurrVolume) + parseFloat(line[2]);
 
          // take sum
          groupedNumTrades = parseFloat(groupedNumTrades) + parseFloat(line[3]);
 
          // take earliest of group
          groupedOpenPrice = line[4];
 
          // take maximum value of group
          groupedHighPrice = Math.max(groupedHighPrice, parseFloat(line[6]));
 
          // take minimum value of group
          groupedLowPrice = Math.min(groupedLowPrice, parseFloat(line[7]));
 
          isFirstElement = false;
 
        })
 
        groupedRows.push(new Array(groupedTime, groupedBaseCurrVolume, groupedTradeCurrVolume, groupedNumTrades, groupedOpenPrice, groupedClosePrice, groupedHighPrice, groupedLowPrice));
 
      })
 
      groupedRows = groupedRows.reverse();
 
      winston.info("Grouped results");
 
      var groupedString = "";

      groupedRows.forEach(function(g) {
        winston.info(g);
        groupedString = groupedString + g.toString() + "\n";
      })

      // TODO make this download instead of display
      res.setHeader('Content-disposition', 'attachment; filename=offersExercised.csv');
      res.setHeader('Content-type', 'text/csv');
      res.charset = 'UTF-8';

      // display output grouped by timeMultiple
      res.end(groupedString);

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
 *    staleView: true/false, // optional, defaults to true
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


  // set stale view option
  if ((!req.body.hasOwnProperty('stale') && !req.body.hasOwnProperty('staleView'))
    || req.body.stale || req.body.staleView) {
    viewOpts.stale = 'update_after';
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

  _.each(gateways, function(entry){

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
  gateways.forEach(function(gateway){
    gateway.accounts.forEach(function(acct){
      if (acct.currencies.indexOf(currName.toUpperCase()) !== -1) {
        issuers.push(acct.address);
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
  gateways.forEach(function(gateway){
    if (gateway.name.toLowerCase() === name.toLowerCase()) {
      gateway.accounts.forEach(function(account){
        currencies = currencies.concat(account.currencies);
      });
    }
  });
  return currencies;
}

app.use(express.static('public'));
app.listen(config.port);
winston.info('Listening on port ' + config.port);


