var winston = require('winston'),
  moment = require('moment'), 
  request = require('request'),
  express = require('express'),
  app = express(),
  config = require('./apiConfig.json'),
  couchdbURL = 'http://' + config.couchdb.username + 
      ':' + config.couchdb.password + 
      '@' + config.couchdb.host + 
      ':' + config.couchdb.port + 
      '/' + config.couchdb.database + '/';

app.use(express.bodyParser());


/**
 *  offersExercised returns reduced or individual 
 *  trade-level data about trades that were executed
 *
 *  expects req.body to have:
 *  {
 *    baseCurrency: "XRP" OR "USD" OR ["XRP"] OR ["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"],
 *    baseCurrencyIssuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", // optional, expected only if base currency is a string
 *    tradeCurrency: (same as baseCurrency),
 *    tradeCurrencyIssuer: (same as baseCurrencyIssuer), // optional
 *    staleView: true/false, // optional, defaults to true
 *    descending: true/false, // optional, defaults to true
 *    startTime: (any momentjs-readable date), // optional, defaults to now if descending is true, 30 days ago otherwise
 *    endTime: (any momentjs-readable date), // optional, defaults to 30 days ago if descending is true, now otherwise
 *    timeIncrement: (any of the following: "ALL", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND")
 *  }
 */

app.post('/api/offersExercised/', function (req, res) {

  // construct keys to query view
  var currPair = [[req.body.baseCurrency, req.body.baseCurrencyIssuer], 
                  [req.body.tradeCurrency, req.body.tradeCurrencyIssuer]],
    startTime = moment().min(
      moment.utc(req.body.startTime),
      moment.utc(req.body.endTime)).toArray(),
    endTime = moment().max(
      moment.utc(req.body.startTime),
      moment.utc(req.body.endTime)).toArray();

  if (!req.body.hasOwnProperty('descending') || req.body.descending) {
    var tempTime = startTime;
    startTime = endTime;
    endTime = tempTime;
  }

  var startkey = currPair.concat(startTime),
    endkey = currPair.concat(endTime);

  var params = {
    url: couchdbURL + 
      '_design/transactions' + 
      '/_view/offersExercised',
    qs: {
      descending: (!req.body.hasOwnProperty('descending') || req.body.descending),
      reduce: (!req.body.hasOwnProperty('reduce') || req.body.reduce),
      startkey: startkey,
      endkey: endkey,
    }
  };

  if (!req.body.hasOwnProperty('timeIncrement')) {
    params.qs.group_level = 2 + 3; // default to 'DAY'
  } else if (req.body.timeIncrement === 'ALL') {
    params.qs.group = false;
  } else {
    var level = ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'].indexOf(req.body.timeIncrement);
    if (level === -1) {
      params.qs.group_level = 2 + 3; // default to 'DAY'
    } else {
      params.qs.group_level = 2 + level;
    }
  }

  request.get(params, function(err, requestRes, data){

    if (err) {
      winston.error('Error with request: ' + err);
      return;
    }

    JSON.parse(data).rows.map(function(row){

      var time = moment.utc(row.key.slice(2));
      winston.info(time.format(), row.value);
    });

  });


});


app.listen(config.port);
console.log('Listening on port ' + config.port);


