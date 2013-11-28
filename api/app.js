var winston = require('winston'),
  moment = require('moment'),
  express = require('express'),
  app = express(),
  config = require('./apiConfig.json'),
  db = require('nano')('http://' + config.couchdb.username + ':' + config.couchdb.password + '@' + config.couchdb.host + ':' + config.couchdb.port + '/' + config.couchdb.database);

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
 *    timeIncrement: (any of the following: "ALL", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND")
 *    
 *    csv: true/false // optional, defaults to false (sends result as json)
 *  }
 */

app.post('/api/offersExercised/', function (req, res) {

  var viewOpts = {};

  winston.info(JSON.stringify(req.body));

  // parse currency details
  var baseCurr = (!req.body.base.issuer ? [req.body.base.currency] : [req.body.base.currency, req.body.base.issuer]),
    tradeCurr = (!req.body.trade.issuer ? [req.body.trade.currency] : [req.body.trade.currency, req.body.trade.issuer]),
    currPair = [tradeCurr, baseCurr];

  // parse startTime and endTime
  var startTime, endTime;
  if (!req.body.startTime && !req.body.endTime) {
    startTime = moment.utc().subtract('days', 30);
    endTime = moment.utc();
  } else if (moment(req.body.startTime).isBefore(moment(req.body.endTime))) {
    startTime = moment.utc(req.body.startTime);
    endTime = moment.utc(req.body.endTime);
  } else {
    endTime = moment.utc(req.body.startTime);
    startTime = moment.utc(req.body.endTime);
  }

  if (!req.body.hasOwnProperty('descending') || req.body.descending) {
    viewOpts.descending = true;

    // swap startTime and endTime if results will be in descending order
    var tempTime = startTime;
    startTime = endTime;
    endTime = tempTime;
  }

  // set startkey and endkey
  viewOpts.startkey = currPair.concat(startTime.toArray().slice(0,6));
  viewOpts.endkey = currPair.concat(endTime.toArray().slice(0,6));

  // determine the group_level from the timeIncrement field
  if (req.body.timeIncrement) {
    var inc = req.body.timeIncrement.toLowerCase(),
      levels = ['year', 'month', 'day', 'hour', 'minute', 'second'];
    if (inc === 'all') {
      viewOpts.group = false;
    } else if (levels.indexOf(inc)) {
      viewOpts.group_level = 3 + levels.indexOf(inc);
    } else {
      viewOpts.group_level = 3 + 2; // default to day
    }
  } else {
    viewOpts.group_level = 3 + 2; // default to day
  }

  // set reduce option
  if (!req.body.hasOwnProperty('reduce')) {
    viewOpts.reduce = true;
  } else {
    viewOpts.reduce = req.body.reduce;
  }

  // set stale view option
  if ((!req.body.hasOwnProperty('stale') && !req.body.hasOwnProperty('staleView'))
    || req.body.stale || req.body.staleView) {
    viewOpts.stale = 'update_after';
  }
  
  winston.info('viewOpts:' + JSON.stringify(viewOpts));

  db.view("transactions", "offersExercised", viewOpts, function(err, couchRes){

    if (err) {
      winston.error('Error with request: ' + err);
      return;
    }

    winston.info('Got ' + couchRes.rows.length + ' rows');

    // send result either as json or csv string
    if (!req.body.csv || req.body.csv === 'false') {
      console.log('send as json');

      var rows = couchRes.rows.map(function(row){

        // reformat rows
        return {
          time: moment.utc(row.key.slice(2)).format(),
          baseCurrencyVolume: row.value.curr2Volume,
          tradeCurrencyVolume: row.value.curr1Volume,
          open: row.value.open,
          close: row.value.close,
          high: row.value.high,
          low: row.value.low,
          volumeWeightedAverage: row.value.volumeWeightedAvg
        };

      });

      res.json(rows);
    
    } else {

      var csvRows = [['time', 'baseCurrencyVolume', 'tradeCurrencyVolume', 'open', 'close', 'high', 'low', 'volumeWeightedAverage'].join(', ')];
      couchRes.rows.forEach(function(row){
        csvRows.push([
          moment.utc(row.key.slice(2)).format(),
          row.value.curr2Volume,
          row.value.curr1Volume,
          row.value.open,
          row.value.close,
          row.value.high,
          row.value.low,
          row.value.volumeWeightedAvg
          ].join(', '));
      });

      res.send(csvRows.join('\n'));
    }

  });


});

app.use(express.static('public'));

app.listen(config.port);
console.log('Listening on port ' + config.port);


