
/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    api = require('./routes/api'),
    model = require('./model'),
    interp = require('./interpreter');

var app = module.exports = express();
var server = require('http').createServer(app);

// Hook Socket.io into Express
var io = require('socket.io').listen(server);

// Ripple client
var ripple = require('../ripple/src/js');
var remote = ripple.Remote.from_config({
//  trace: true,
  "websocket_ip" : "192.168.0.17",
  "websocket_port" : 5006,
  "websocket_ssl" : false
//  "websocket_ip" : "s1.ripple.com",
//  "websocket_port" : 51233,
//  "websocket_ssl" : true
});

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/public'));
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

app.get('/', routes.index);
app.get('/partials/:name', routes.partials);

// JSON API

app.get('/api/name', api.name);

// redirect all others to the index (HTML5 history)
app.get('*', routes.index);

// Start server
server.listen(3000, function(){
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
