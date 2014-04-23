var env      = process.env.NODE_ENV || "development";
var DBconfig = require('../db.config.json')[env];
var config   = require('../deployment.environments.json')[env];

//local vars
var winston = require('winston'),
  express   = require('express'),
  moment    = require('moment'),
  app       = express();
  
if (!config)   return winston.info('Invalid environment: ' + env);
if (!DBconfig) return winston.info('Invalid DB config: '+env);
db = require('./library/couchClient')({
  url : DBconfig.protocol+
    '://' + DBconfig.username + 
    ':'   + DBconfig.password + 
    '@'   + DBconfig.host + 
    ':'   + DBconfig.port + 
    '/'   + DBconfig.database,
  //log : function (id, args) {
  //  console.log(id, args);
  //},
  request_defaults : {timeout :30 * 1000} //30 seconds max for couchDB 
});


DEBUG = (process.argv.indexOf('debug')  !== -1) ? true : false;
CACHE = config.redis && config.redis.enabled    ? true : false;

if (process.argv.indexOf('debug')    !== -1) DEBUG = true;
if (process.argv.indexOf('no-cache') !== -1) CACHE = false; 
  
if (CACHE) {
  if (!config.redis || !config.redis.port || !config.redis.host) {
    CACHE = false;
    winston.error("Redis port and host are required");
    
  } else {
    redis = require("redis").createClient(config.redis.port, config.redis.host, config.redis.options);
  }
}

gatewayList = require('./gateways.json');
  // TODO find permanent location for gateways list
  // should the gateways json file live in couchdb?

DATEARRAY  = ['YYYY', '-MM', '-DD', 'THH', ':mm', ':ssZZ'];
DATEFORMAT = DATEARRAY.join('');
  


var apiRoutes = {
  'offers'                  : require("./routes/offers"),
  'offersexercised'         : require("./routes/offersExercised"),
  'topmarkets'              : require("./routes/topMarkets"),
  'marketmakers'            : require("./routes/marketMakers"),
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
app.use(express.bodyParser()); // TODO use express.json() instead of bodyParser
app.post('/api/*', requestHandler);
app.listen(config.port);
winston.info('Listening on port ' + config.port);


//function to handle all incoming requests
function requestHandler(req, res) {
  var path = req.path.slice(5), apiRoute;
  var time = Date.now();
  var ip   = req.connection.remoteAddress;
  
  if (path.indexOf('/') > 0) path = path.slice(0, path.indexOf('/'));
  
  winston.info(ip, "POST", path, "["+(new Date())+"]");
  apiRoute = path.replace(/_/g, "").toLowerCase();
  
  if (apiRoutes[apiRoute]) {
    apiRoutes[apiRoute](req.body, function(err, response){

      if (err) {
        winston.error(err, " - "+path, "(Server Error) 500");
        return res.send(500, { error: err });
      }
      
      time = (Date.now()-time)/1000;
      winston.info(ip, path, 200, "["+(new Date())+"]", time+"s");
      res.send(200, response);  
    });
    
  } else {
    
    winston.info("Response 404 Not Found - ", path);
    res.send(404, 'Sorry, that API route doesn\'t seem to exist.'+
      ' Available paths are: ' + 
      Object.keys(apiRoutes).join(', ') + '\n');
  }
  
  res.setTimeout(45 * 1000); //max 45s
  res.on("timeout", function(){
    winston.error("Response 408 Request Timeout - ", path);
    res.send(408, {error: "Request Timeout"});
  }); 
}

if (CACHE) {
  redis.flushdb(); //reset cache on restart
  redis.on("error", function (err) {
    winston.error("Redis - " + err);
    CACHE = false; //turn it off if its not workings
  });
  
  //on connect, get last 10 minutes of ledger closes.  Walk forward
  //to see if they are all consecutive. If they are not consecutive,
  //save the last consecutive ledger index and close time.  This will 
  //be the point from which we determine whether or not we are caught up
/*  
  require("./routes/ledgersClosed")({
    startTime  : moment.utc().subtract(10, "minutes"),
    descending : false,
    reduce     : false
      
  }, function(error, data) {
    if (error) {
      CACHE = false; //disable the cache
      return winston.error(error);
    }
    
    data.shift(); //remove header row
    
  });
*/      
}








