exports.net = {
  genesis_ledger: 32570
};

exports.perf = {
  /**
   * Number of parallel worker threads.
   *
   * This specifies the number of threads to use when bulk processing historic
   * ledgers.
   */
  workers: 4
};

exports.stats = {
  /**
   * Ledger aggregation interval (in s).
   *
   * During statistical aggregation, data will be combined per this time period.
   * A value that is too large will limit the resolution of the data. A value
   * that is too small will impact performance.
   *
   * Default: 3600 seconds (= 1 hour)
   */
  aggregation_interval: 3600
};

exports.remote = {
//  trace: true,
  "websocket_ip" : "127.0.0.1",
  "websocket_port" : 5006,
  "websocket_ssl" : false
//  "websocket_ip" : "192.168.0.17",
//  "websocket_port" : 5006,
//  "websocket_ssl" : false
//  "websocket_ip" : "ripplecharts.com",
//  "websocket_port" : 5006,
//  "websocket_ssl" : false
//  "websocket_ip" : "s1.ripple.com",
//  "websocket_port" : 51233,
//  "websocket_ssl" : true
};

exports.db = {
  "mysql_ip" : "127.0.0.1",
  "mysql_user" : "root",
  "mysql_pass" : "vertrigo",
  "mysql_db" : "rpcharts"
};

exports.s3 = {
  "bucket": "ripple-data",
  "key": "AKIAIQUYVAHE3GAW3H5Q",
  "secret": "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"
};
