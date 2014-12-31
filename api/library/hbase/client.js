var thrift     = require('thrift');
var HBase      = require('./hbase');
var HBaseTypes = require('./hbase_types');
var log    = require('winston');

var Client = function (options) {
  var self = this;
  var connection;
  
  self.hbase = null;
  
  self.isConnected = function () {
    return !!self.hbase && !!connection && connection.connected;
  }
  
  self.connect = function () {
    log.info('connecting to hbase');
    connection = thrift.createConnection(options.host, options.port, {
      transport : thrift.TFramedTransport,
      protocol  : thrift.TBinaryProtocol,
      connect_timeout : 10000
    });
    
    connection.on('error', function (err) {
      log.error('hbase error', err);
    }); 
    
    connection.on('connect', function() {
      self.hbase = thrift.createClient(HBase,connection);
      log.info('hbase connected');
    });
    
    connection.on('close', function() {
      console.log('hbase close');
      self.connect(); //attempt reconnect
    });
    
    return self;
  }
}

Client.prototype.getRows = function (table, keys, callback) {
  var list = [];
  var self = this;
  
  keys.forEach(function(key) {
    list.push(new HBaseTypes.TGet({row : key}));
  });
  
  
  self.hbase.getMultiple(table, list, function(err, resp) {
    var rows = [];
    if (err) {
      callback(err);
      return;
    }
    
    resp.forEach(function(hbaseRow) {
      var row = { };
      
      if (!hbaseRow.columnValues.length) {
        return;
      }
      
      hbaseRow.columnValues.forEach(function(column) {
        row[column.qualifier] = column.value;
      });
      
      rows.push(row);
    });
    
    callback(null, rows);
  });
};

module.exports = Client;