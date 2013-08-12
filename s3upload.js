var express = require('express'),
    extend = require('extend'),
    fs = require('fs'),
    winston = require('winston'),
    config = require('./config'),
    model = require('./model');

var app = module.exports = express();

// Ripple client
var ripple = require('ripple-lib');
var utils = require('ripple-lib').utils;
var remote = ripple.Remote.from_config(config.remote);

// MySQL
var mysql = require('mysql');
var db = mysql.createConnection({
  host: config.db.mysql_ip,
  user: config.db.mysql_user,
  password: config.db.mysql_pass,
  database: config.db.mysql_db,
  multipleStatements: true
});

//Amazon S3
var knox = require('knox');
var client = knox.createClient({
  key: config.s3.key,
  secret: config.s3.secret,
  bucket: config.s3.bucket
});

// Configuration
var http_config = {};
app.configure(function(){
  extend(http_config, {
    ssl: false,
    port: 3000
  });
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/public'));
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  extend(http_config, {
    ssl: {
      key: fs.readFileSync('./ssl/server.key'),
      cert: fs.readFileSync('./ssl/server.crt')
    },
    port: 443
  });
  app.use(express.errorHandler());
});

var server = http_config.ssl ?
      require('https').createServer(http_config.ssl, app) :
      require('http').createServer(app);

// Hook Socket.io into Express
var io = require('socket.io').listen(server);

// Start server

model.broadcast = function (method, data) {
  io.sockets.emit(method, data);
};

io.sockets.on('connection', function (socket) {
  socket.emit('apply', model.data);
});

remote.on('error', function (err) {
  winston.error(err);
});

remote.on('connected', function(connection) {
  winston.info('WebSocket client connected');

  model.apply({
    status_connected: true
  });
  getLedgerIndex();
});

remote.on('disconnected', function(connection) {
  model.apply({
    status_connected: false
  });
});

startupHttp();

function startupHttp()
{
  server.listen(http_config.port, function(){
    winston.info("Express server listening on port %d in %s mode",
                this.address().port, app.settings.env);

    startupMysql();
  });
}

function startupMysql()
{
  db.connect(function (err) {
    if (err) {
      winston.error(err);
    }

    winston.info("Connected to MySQL server");

	remote.connect();
  });
}

function getLedgerIndex() {
  db.query('SELECT value FROM config WHERE `key` = ?', ['ledger_processed'],
            function (err, rows)
  {
    if (err) {
      winston.error(err);
      return;
    }

    var latest = Math.max(+(rows[0] && rows[0].value) || 0, config.net.genesis_ledger);
    requestLedger(latest+1);
  });
}

function checkS3Upload (ledger_index) {
  var s3_filename = '/ledger/'+ledger_index+'.json';
  winston.info(s3_filename);
  client.get(s3_filename).on('response', function(res){
    if(res.statusCode != 200) 
      requestLedger(ledger_index);
    else
      checkS3Upload(ledger_index+1);
  }).end();
}

function requestLedger(ledger_index) {
  try {
    var replied = false;
    remote.request_ledger(undefined, { transactions: true, expand: true })
	  .ledger_index(ledger_index)
	  .on('error', function (err) {
	    if (replied) return;
	    console.log("REQUEST LEDGER ERROR");
	  })
      .on('success', function (m) {
	    if (replied) return;
	    replied = true;
	    uploadToS3(m, ledger_index);
	  })
	  .request()
    ;

    // As of writing this, ripple-lib does not handle the server connection
    // being lost while waiting for a ledger request response.
    //
    // This can get the whole processing pipeline stuck, so we add a timeout
    // so we can recover from this condition.
    setTimeout(function () {
	  if (replied) return;
	  console.log("REQUEST LEDGER TIMEOUT");
	  replied = true;
    }, 10000);
  } catch(e) { callback(e); }
}

function uploadToS3 (e, ledger_index) {
  var ledger = e.ledger;
  var s3_filename = '/ledger/'+ledger_index+'.json';
  var ledger_string = JSON.stringify(ledger);
  var req = client.put(s3_filename, {
    'Content-Length': ledger_string.length,
    'Content-Type': 'application/json',
    'x-amz-acl': 'public-read' 
  });
  req.on('response', function(res){
    if (200 == res.statusCode) {
      console.log('saved to %s', req.url);
    }
    checkS3Upload(ledger_index+1);
  });

  req.end(ledger_string);
}