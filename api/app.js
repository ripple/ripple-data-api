var env        = process.env.NODE_ENV || "development";
var DBconfig   = require(process.env.DB_CONFIG || '../db.config.json')[env];
var config     = require(process.env.DEPLOYMENT_ENVS_CONFIG || '../deployment.environments.json')[env];
var StatsD     = require('node-statsd').StatsD;
var http       = require('http');
var https      = require('https');
var gateways   = require('./routes/gateways').Gateways;
var assets     = require('./routes/gateways').Assets;
var currencies = require('./routes/gateways').Currencies;

var maxSockets;

var posix = require('posix');

//this is the maximum number of concurrent requests to couchDB
maxSockets = config.maxSockets || 100;
http.globalAgent.maxSockets = https.globalAgent.maxSockets = maxSockets;

console.log("max sockets:", maxSockets);
console.log("file descriptor limits:", posix.getrlimit('nofile'));
//posix.setrlimit('nofile', {soft:65536, hard:65536}); //setting these in upstart
//console.log("new file descriptor limits:", posix.getrlimit('nofile'));

//local vars
var winston = require('winston');
var express = require('express');
var moment  = require('moment');
var monitor = require('./library/monitor');
var app     = express();

if (!config)   return winston.info('Invalid environment: ' + env);
if (!DBconfig) return winston.info('Invalid DB config: '+env);
if (!config.statsd) config.statsd = {};

statsd = new StatsD({
  host     : config.statsd.host   ? config.statsd.host   : null,
  port     : config.statsd.port   ? config.statsd.port   : null,
  prefix   : config.statsd.prefix ? config.statsd.prefix + "." : null,
  cacheDns : true
});


db = require('./library/couchClient')({
  url : DBconfig.protocol+
    '://' + DBconfig.username +
    ':'   + DBconfig.password +
    '@'   + DBconfig.host +
    ':'   + DBconfig.port +
    '/'   + DBconfig.database,
  log : function (id, args) {
    if (!args[0])
      console.log(id, args);
    if (args[0].err)
      console.log(id, args[0].err, args[0].headers);
  },
  //request_defaults : {timeout:60 *1000}
});

//set up global debug and cache variables
DEBUG = (process.argv.indexOf('debug')  !== -1) ? true : false;
CACHE = config.redis && config.redis.enabled    ? true : false;

if (process.argv.indexOf('debug')    !== -1) DEBUG = true;
if (process.argv.indexOf('no-cache') !== -1) CACHE = false;

gatewayList = require('./gateways.json');
  // TODO find permanent location for gateways list
  // should the gateways json file live in couchdb?

DATEARRAY  = ['YYYY', '-MM', '-DD', 'THH', ':mm', ':ssZZ'];
DATEFORMAT = DATEARRAY.join('');

var apiRoutes = {
  'offers'                  : require("./routes/offers"),
  'offersexercised'         : require("./routes/offersExercised"),
  'topmarkets'              : require("./routes/totalTradeVolume"),
  'totaltradevolume'        : require("./routes/totalTradeVolume"),
  'markettraders'           : require("./routes/marketTraders"),
  'accountscreated'         : require("./routes/accountsCreated"),
  'issuercapitalization'    : require("./routes/issuerCapitalization"),
  'currencybalances'        : require("./routes/currencyBalances"),
  'totalnetworkvalue'       : require("./routes/totalNetworkValue"),
  'exchangerates'           : require("./routes/exchangeRates"),
  'valuesent'               : require("./routes/valueSent"),
  'totalvaluesent'          : require("./routes/totalValueSent"),
  'accounttransactions'     : require("./routes/accountTransactions"),
  'accounttransactionstats' : require("./routes/accountTransactionStats"),
  'accountoffersexercised'  : require("./routes/accountOffersExercised"),
  'accounttrust'            : require("./routes/accountTrust"),
  'transactionstats'        : require("./routes/transactionStats"),
  'ledgersclosed'           : require("./routes/ledgersClosed"),
  'historicalmetrics'       : require("./routes/historicalMetrics"),
};


// enable CORS
var allowCrossDomain = function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

  // intercept OPTIONS method
  if ('OPTIONS' == req.method) res.send(200);
  else next();
};

app.use(allowCrossDomain);
app.use(express.json());
app.use(express.urlencoded());
app.get('/api/gateways/:gateway?', gateways);
app.get('/api/gateways/:gateway/assets/:filename?', assets);
app.get('/api/currencies/:currencyAsset?', currencies);
app.get('/health', function (req, res){
  res.send(200, '');
});

app.post('/api/*', requestHandler);
app.listen(config.port);
winston.info('Listening on port ' + config.port);

//function to handle all incoming requests
function requestHandler(req, res) {
  var path = req.path.slice(5),
    time   = Date.now(),
    ip     = getClientIp(req),
    apiRoute, nSockets, code;

  if (path.indexOf('/') > 0) path = path.slice(0, path.indexOf('/'));

  winston.info(ip, "POST", path, "["+(new Date())+"]");
  apiRoute = path.replace(/_/g, "").toLowerCase();

  if (apiRoutes[apiRoute]) {

    nSockets = countSockets();
    monitor.logRequest(apiRoute, nSockets);

    if (nSockets >= maxSockets) return res.send(503, { error: "Service Unavailable"});

    apiRoutes[apiRoute](req.body, function(err, response){

      //dont send headers if they were already sent
      if(res._header) {
        console.log("header allready set!", err || null);
        return;
      }

      if (err) {
        if (err === 'CouchDB - Service Unavailable' || err === 'CouchDB - Too Many Connections') {
          code = 503;
        } else if (err === 'CouchDB - Request Timeout') {
          code = 408;
        } else {
          code = 500;
        }

        winston.error(err, " - "+path, "(Server Error) " + code);
        res.send(code, { error: err });
        return;
      }

      res.send(200, response);
      time = Date.now()-time;
      winston.info(ip, path, 200, "["+(new Date())+"]", (time/1000)+"s");
      monitor.logResponseTime(time, apiRoute);
    });

  } else {

    winston.info("Response 404 Not Found - ", path);
    res.send(404, 'Sorry, that API route doesn\'t seem to exist.'+
      ' Available paths are: ' +
      Object.keys(apiRoutes).join(', ') + '\n');
  }

  //res.setTimeout(2 * 60 * 1000); //max 45s
  //res.on("timeout", function(){
  //  winston.error("Response 408 Request Timeout - ", path);
  //  res.send(408, {error: "Request Timeout"});
  //});
}

//initialize ledger monitor
monitor.ledgerMonitor();

//cache initialization
if (CACHE) {
  if (!config.redis || !config.redis.port || !config.redis.host) {
    CACHE = false;
    winston.error("Redis port and host are required");

  } else {
    redis = require("redis").createClient(config.redis.port, config.redis.host, config.redis.options);

    //reset cache if the arg is present
    if (process.argv.indexOf('reset-cache') !== -1) redis.flushdb();

    redis.on("error", function (err) {
      winston.error("Redis - " + err);
      CACHE = false; //turn it off if its not working
    });

    //initialize the metrics data
    require('./library/metrics').init();

    //initialize historical metrics and associated cron jobs
    require('./library/history').init();
  }
}

/**
 * get Client IP address
 */

function getClientIp(req) {
  var clientIp;
  var ipString;

  if (!req.headers &&
      !req.connection &&
      !req.socket) return null;

  if (clientIp = req.headers['x-client-ip']) {
    return clientIp;

  //'x-forwarded-for' header may return multiple IP
  //addresses in the format: "client IP, proxy 1 IP, proxy 2 IP"
  //so take the first one
  } else if (ipString = req.headers['x-forwarded-for']) {
    return ipString.split(',')[0];

  } else {
    return req.headers['x-real-ip'] ||
      req.connection.remoteAddress  ||
      req.socket.remoteAddress      || null;
  }
}

function countSockets () {
  var count = 0;
  for (var key1 in http.globalAgent.sockets) {
    count += http.globalAgent.sockets[key1].length;
  }

  for (var key2 in https.globalAgent.sockets) {
    count += https.globalAgent.sockets[key2].length;
  }

  if (DEBUG) winston.info("open sockets: ", count);
  return count;
}
