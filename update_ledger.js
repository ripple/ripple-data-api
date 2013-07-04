
/**
 * Module dependencies.
 */

var express = require('express'),
    extend = require('extend'),
    fs = require('fs'),
    _ = require('lodash'),
    winston = require('winston'),
    config = require('./config'),
    routes = require('./routes'),
    api = require('./routes/api'),
    model = require('./model'),
    interp = require('./interpreter'),
    index = require('./indexes');

var Range = require('./range').Range;

var app = module.exports = express();

var ledger_index = process.argv.splice(2)[0];

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

// Configuration
var http_config = {};
app.configure(function(){
  extend(http_config, {
    ssl: false,
    port: 3000
  });
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon(__dirname + '/public/img/icon/favicon.ico'));
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
io.set('log level', 1);

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
  if (ledger_index) {
    remote.request_ledger(parseInt(ledger_index), "full")
      .on('error', function (err) {
        console.error(err);
      })
      .on('success', function (e) {
        var ledger_data = interp.applyLedger(model, e);
        add_caps(ledger_data);
      })
      .request();
  } else {
    console.log('There is not ledger index');
    server.close();
    
  }
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
    startupRipple();
  });
}

function startupRipple()
{
  remote.connect();
}

function add_caps (data) {
  db.query("DELETE FROM caps WHERE ledger = ?",
           [data.ledger_index],
           function (err)
  {
    if (err) callback(err);
    insert_caps_data(data);
  });
}

function insert_caps_data (data) {
  var caps_row = [];
  _.each(data.currencies, function(item, key) {
     var i = index.issuersByAddress[item.iss].id, 
         c = index.currenciesByCode[item.cur].id,
         amount = item.cap.value,
         date = new Date(utils.toTimestamp(data.ledger_date));
     caps_row.push([c, i, 0, date, data.ledger_index, amount]);
  });
  db.query("INSERT INTO caps (c, i, type, time, ledger, amount) VALUES ?",
           [caps_row],
           function (err) {
    if (err) winston.error(err);
  });
}