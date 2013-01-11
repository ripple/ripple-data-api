
/**
 * Module dependencies.
 */

var express = require('express'),
    extend = require('extend'),
    fs = require('fs'),
    routes = require('./routes'),
    api = require('./routes/api'),
    model = require('./model'),
    interp = require('./interpreter');

var app = module.exports = express();

// Hook Socket.io into Express
var io = require('socket.io').listen(server);

// Ripple client
var ripple = require('../ripple/src/js');
var remote = ripple.Remote.from_config({
//  trace: true,
  "websocket_ip" : "127.0.0.1",
  "websocket_port" : 5006,
  "websocket_ssl" : false
//  "websocket_ip" : "s1.ripple.com",
//  "websocket_port" : 51233,
//  "websocket_ssl" : true
});

// Configuration
var config = {};
app.configure(function(){
  extend(config, {
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
  extend(config, {
    ssl: {
      key: fs.readFileSync('./ssl/server.key'),
      cert: fs.readFileSync('./ssl/server.crt')
    },
    port: 443
  });
  app.use(express.errorHandler());
});

var server = config.ssl ?
      require('https').createServer(config.ssl, app) :
      require('http').createServer(app);

// Routes

app.get('/', routes.index);
app.get('/partials/:name', routes.partials);

// JSON API

app.get('/api/name', api.name);

// redirect all others to the index (HTML5 history)
app.get('*', routes.index);

// Start server
server.listen(config.port, function(){
  console.log("Express server listening on port %d in %s mode",
              this.address().port, app.settings.env);

  remote.connect();
});

model.broadcast = function (method, data) {
  io.sockets.emit(method, data);
};

io.sockets.on('connection', function (socket) {
  socket.emit('apply', model.data);
});

remote.on('connected', function(connection) {
  console.log('WebSocket client connected');

  remote.request_subscribe(['ledger', 'transactions']).request();

  remote.request_ledger("ledger_closed", "full")
    .on('success', function (e) {
      interp.applyLedger(model, e);
    })
    .request();

  remote.on('net_transaction', function (e) {
    interp.applyTransaction(model, e);
  });
  remote.on('ledger_closed', function (e) {
    model.apply({
      ledger_hash: e.ledger_hash,
      ledger_index: e.ledger_index,
      ledger_time: e.ledger_time
    });
  });
});
