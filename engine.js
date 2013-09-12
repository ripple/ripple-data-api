var config = require('./config');

var winston = require('winston');
var mysql = require('mysql');
var ripple = require('ripple-lib');
var events = require('events');
var util = require('util');

var Aggregator = require('./aggregator').Aggregator;
var Processor = require('./processor').Processor;

var Engine = function () {
  events.EventEmitter.call(this);

  var self = this;

  // Ripple client
  this.remote = ripple.Remote.from_config(config.remote);

  // MySQL
  this.db = mysql.createConnection({
    debug: config.db.mysql_debug,
    host: config.db.mysql_ip,
    user: config.db.mysql_user,
    password: config.db.mysql_pass,
    database: config.db.mysql_db,
    multipleStatements: true
  });

  // Statistical data aggregator
  this.aggregator = new Aggregator(this.db);

  // Historic data processor
  this.processor = new Processor(this.db, this.remote);
};
util.inherits(Engine, events.EventEmitter);

Engine.prototype.startup = function (callback)
{
  if ("function" === typeof callback) {
    this.once('started', callback);
  }

  this._startupMysql();
};

Engine.prototype._startupMysql = function ()
{
  var self = this;

  self.db.connect(function (err) {
    if (err) {
      winston.error(err);
      process.exit(1);
    }

    winston.info("Connected to MySQL server");
    self._startupRipple();
  });
};

Engine.prototype._startupRipple = function ()
{
  var self = this;

  this.remote.connect();
  this.remote.once('connected', function () {
    winston.info("Connected to Ripple network");
    self._notifyStartupComplete();
  });
};

Engine.prototype._notifyStartupComplete = function ()
{
  this.emit('started');
};

Engine.prototype.shutdown = function ()
{
  this.db.end();
  this.remote.disconnect();
};

exports.Engine = Engine;
