var winston = require('winston'),
  moment = require('moment'),
  _ = require('lodash'),
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

// TODO handle hot wallets

// TODO use express.json() instead of bodyParser
app.use(express.bodyParser());



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
 *    timeIncrement: (any of the following: "ALL", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND") // optional, defaults to "DAY"
 *    
 *    format: (either 'csv' or 'json', defaults to 'json')
 *  }
 */
app.post('/api/offersExercised/', function (req, res) {

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
      return;
      // TODO handle invalid issuer better
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
      return;
      // TODO handle invalid issuer better
    }
  }

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
  } else {
    // TODO handle incorrect values
    winton.error('Inccorect descending value. descending: ' + req.body.descending);
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

  // determine the group_level from the timeIncrement field
  if (viewOpts.reduce === true && req.body.timeIncrement) {
    var inc = req.body.timeIncrement.toLowerCase(),
      levels = ['year', 'month', 'day', 'hour', 'minute', 'second'];
    if (inc === 'all') {
      viewOpts.group = false;
    } else if (inc === 'none') {
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

  // query couchdb
  db.view("transactions", "offersExercised", viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      return;
      // TODO send error messages to api querier
    }

    winston.info('Got ' + couchRes.rows.length + ' rows');
    winston.info(JSON.stringify(couchRes.rows));

    // send result either as json or csv string
    if (req.body.format && req.body.format.toLowerCase() === 'csv') {

      var csvRows = [];

      // add headers
      csvRows.push(['time', 'baseCurrVolume', 'tradeCurrVolume', 'open', 'close', 'high', 'low', 'vwav'].join(', '));

      // add rows
      couchRes.rows.forEach(function(row){
        csvRows.push([
          (row.key ? moment.utc(row.key.slice(2)).format() : moment.utc(row.value.openTime.slice(2)).format()),
          row.value.curr2Volume,
          row.value.curr1Volume,
          row.value.open,
          row.value.close,
          row.value.high,
          row.value.low,
          row.value.volumeWeightedAvg
          ].join(', '));
      });

      // send csv file
      res.setHeader('Content-disposition', 'attachment; filename=offersExercised.csv');
      res.setHeader('Content-type', 'text/csv');
      res.charset = 'UTF-8';
      res.end(csvRows.join('\n'));

      // TODO write data as a stream to download it
    
    } else {

      // send as json

      var apiRes = {};
      apiRes.timeRetrieved = moment.utc().valueOf();

      apiRes.rows = _.map(couchRes.rows, function(row){

        // reformat rows
        return {
          time: (row.key ? moment.utc(row.key.slice(2)).format() : moment.utc(row.value.openTime.slice(2)).format()),
          baseCurrVol: row.value.curr2Volume,
          tradeCurrVol: row.value.curr1Volume,
          open: row.value.open,
          close: row.value.close,
          high: row.value.high,
          low: row.value.low,
          vwav: row.value.volumeWeightedAvg
        };

      });

      res.json(apiRes);

    }

  });


});


/**
 *  gatewayNameToAddress translates a given name and, 
 *  optionally, a currency to its corresponding ripple address or
 *  returns null
 */
 function gatewayNameToAddress( name, currency ) {

  var gatewayAdress = null;

  _.each(gateways, function(entry){

    if (entry.name.toLowerCase() === name.toLowerCase()) {
    
      if (currency) {

        _.each(entry.accounts, function(acct){

          if (acct.currencies.indexOf(currency) !== -1) {
            gatewayAdress = acct.address;
          }
        });

      } else {
         gatewayAdress = entry.accounts[0].address;
      }
    }

  });

  return gatewayAdress;

 }

app.use(express.static('public'));
app.listen(config.port);
winston.info('Listening on port ' + config.port);


