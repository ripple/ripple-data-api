var config = require('./apiConfig.json');

//global vars
db = require('nano')('http://' + config.couchdb.username + 
    ':' + config.couchdb.password + 
    '@' + config.couchdb.host + 
    ':' + config.couchdb.port + 
    '/' + config.couchdb.database);

gatewayList = require('./gateways.json');
  // TODO find permanent location for gateways list
  // should the gateways json file live in couchdb?

DATEARRAY  = ['YYYY', '-MM', '-DD', 'THH', ':mm', ':ssZZ'];
DATEFORMAT = DATEARRAY.join('');
   
   
    
//local vars
var winston = require('winston'),
  _         = require('lodash'),
  express   = require('express'),
  app       = express();


var apiHandlers = {
  'offersexercised'       : require("./routes/offersExercised"),
  'topmarkets'            : require("./routes/topMarkets"),
  'accountscreated'       : require("./routes/accountsCreated"),
  'gatewaycapitalization' : require("./routes/gatewayCapitalization"),
  'issuercapitalization'  : require("./routes/issuerCapitalization"),
  'exchangerates'         : require("./routes/exchangeRates"),
  'gettransaction'        : require("./routes/getTransaction"),
  'numtransactions'       : require("./routes/numTransactions"),
  //'numaccounts'         : numAccountsHandler  //DEPRECIATED
};


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



//API route handler
app.post('/api/*', function(req, res){

  var path = req.path.slice(5),
    apiRoute;
  
  if (path.indexOf('/') !== -1)  apiRoute = path.slice(0, path.indexOf('/')).toLowerCase();
  else                           apiRoute = path.toLowerCase();
  
  

  if (apiHandlers[apiRoute]) apiHandlers[apiRoute](req, res);
  else {

    var availableRoutes = _.map(Object.keys(apiHandlers), function(route){
      return '/api/' + route + '/';
    });
    
    res.send(404, 'Sorry, that API route doesn\'t seem to exist. Available paths are: ' + availableRoutes.join(', ') + '\n');
  }

});

app.use(express.static('public'));
app.listen(config.port);
winston.info('Listening on port ' + config.port);

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

/*DEPRECIATED
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

*/



