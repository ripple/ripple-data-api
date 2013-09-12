var _ = require('lodash');
var winston = require('winston');
var events = require('events');
var util = require('util');

var config = require('./config');
var index = require('./indexes');
var model = require('./model');

var Classifier = require('./classifier').Classifier;

var Meta = require('ripple-lib').Meta;
var Amount = require('ripple-lib').Amount;
var utils = require('ripple-lib').utils;

//Amazon S3
var knox = require('knox');
var client = knox.createClient({
    key: config.s3.key,
    secret: config.s3.secret,
    bucket: config.s3.bucket
});

var cleanCache = {};

function logError(err) {
  winston.error(err.stack ? err.stack : (err.message ? err.message : err));
  if (err.query) {
    winston.info("Related to query: "+err.query.sql);
  }
}

var Processor = function (db, remote, aggregator) {
  events.EventEmitter.call(this);

  this.db = db;
  this.remote = remote;
  this.aggregator = aggregator;

  this.processing = false;
};
util.inherits(Processor, events.EventEmitter);

Processor.prototype.loadState = function ()
{
  var self = this;

  winston.info("LOAD STATE");
  var state = {};
  state.tickers = {};
  state.issuers = [];
  state.currencies = {};

  // We need to clear the caching info, because all of the values have to be
  // refreshed now.
  cleanCache = {};

  self.db.query("SELECT * FROM ledgers ORDER BY `id` DESC LIMIT 0,1",
                function (err, rows)
  {
    if (err) logError(err);

    if (rows[0]) {
      var ledger = rows[0];
      state.account_count = ledger.accounts;
      state.tx_count = ledger.txs_sum;
    }
  });

  _.each(index.xrp, function (data) {
    // Initialize field with basic properties
    state.tickers[data.first] = {
      sym: data.sym,
      first: data.first,
      second: "XRP",
      bid: "0",
      ask: "0",
      last: "0",
      vol: 0,
      hl: data.hl,
      d1: {
        avg: "0",
        hi: "0",
        lo: "0",
        vol: "0"
      },
      d30: {
        avg: "0",
        hi: "0",
        lo: "0",
        vol: "0"
      }
    };
  });

  _.each(index.issuers, function (data) {
    state.issuers[data.id] = data;
    _.each(data.currencies, function (issuer, currency) {
      state.currencies[currency + ":" + issuer] = {
        cur: currency,
        iss: issuer,
        gat: data.id
      };
    });
  });

  model.apply(state);
  self.updateAggregates();
};

/**
 * Retrieve a specific ledger by index.
 */
Processor.prototype.getLedger = function (ledger_index, callback)
{
  var self = this;

  checkLedgerIndex('/meta/ledger-manifest.json', function (s3_ledger_index) {
    if (s3_ledger_index == 0 || ledger_index > s3_ledger_index) {
      requestRemoteLedger();
    } else requestS3Ledger();
  });

  //Check ledger index
  function checkLedgerIndex(fileName, callback) {
    client.get(fileName).on('response', function(res){
      var data = '';
      if(res.statusCode == 200) {
        res.on('data', function(chunk) {
          data += chunk.toString();
        }).on('end', function() {
          var ledger_index_data = JSON.parse(data);
          var latest = Math.max(+ledger_index_data.latest || 0, config.net.genesis_ledger);
          callback(latest);
        });
      } else {
        callback(0);
      }
    }).end();
  }

  //Request ledger data from S3 Chunk
  function requestS3Chunk() {
    client.list({prefix: 'chunk'}, function(err, data){
      if(data.Contents.length > 0) {
        data.Contents.sort(function(a, b) {
          return a.LastModified - b.LastModified;
        });

        _.each(data.Contents, function(item) {
          client.get(item.Key).on('response', function(res){
            var data = '';
            if(res.statusCode == 200) {
              winston.info("Ledger found on S3 (chunk)");
              res.on('data', function(chunk) {
                data += chunk.toString();
              }).on('end', function() {
                var ledger_data = JSON.parse(data);
                if (ledger_data.ledgers.length > 0) {
                  var ledger = _.find(ledger_data.ledgers, function(ledger_item) {
                    if (parseInt(ledger_item.ledger.ledger_index) === parseInt(ledger_index)) {
                      return ledger_item;
                    }
                  });
                  callback(null, ledger);
                }
              });
            }
          }).end();
        });
      } else {
        requestS3Ledger();
      }
    });
  }

  //Request ledger data from S3 Ledger
  function requestS3Ledger(){
    var read_file = '/ledger/'+ledger_index+'.json';
    client.get(read_file).on('response', function(res){
      var data = '';
      if(res.statusCode == 200) {
        winston.info("Ledger found on S3 (single)");
        res.on('data', function(ledger) {
          data += ledger.toString();
        }).on('end', function() {
          var ledger_data = JSON.parse(data);
          callback(null, {ledger: ledger_data});
        });
      } else {
        requestRemoteLedger();
      }
    }).on('error', function (err) {
      console.error(err);
      process.exit(15);
    }).end();
  }

  //Request ledger data from Remote
  function requestRemoteLedger() {
    console.log('Get from remote');
    try {
      var replied = false;
      winston.debug("Downloading ledger "+ledger_index);
      self.remote.request_ledger(undefined, { transactions: true, expand: true })
        .ledger_index(ledger_index)
        .on('error', function (err) {
          if (replied) return;
          console.log("REQUEST LEDGER ERROR");
          replied = true;
          callback(err);
        })
        .on('success', function (m) {
          if (replied) return;
          replied = true;
          callback(null, m);
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
        callback(new Error("Ledger request timed out"));
      }, 10000);
    } catch(e) { callback(e); }
  }
};

/**
 * Process old ledgers from the last processed until current.
 *
 * Looks up what the most recently processed ledger was, then starts processing
 * ledgers until it reaches the current one.
 */
Processor.prototype.processValidated = function (vrange)
{
  var self = this;

  if (self.processing) return;

  var start;

  findNextLedger();

  function findNextLedger() {
    self.db.query('SELECT value FROM config WHERE `key` = ?',
                  ['ledger_processed'],
                  handleLedgerStatusResult);
  }

  function handleLedgerStatusResult(err, rows) {
    self.processing = false;
    if (err) {
      logError(err);
      return;
    }

    var latest = Math.max(+(rows[0] && rows[0].value) || 0, config.net.genesis_ledger);
    start = latest+1;

    processLedger();
  }

  function processLedger() {
    if (!vrange.is_member(start)) return;

    self.processing = true;
    self.processLedger(start, updateStatus);
  }

  function updateStatus(err) {
    self.processing = false;
    if (err) {
      logError(err);
      return;
    }

    winston.debug("Updating process status to "+start);

    self.processing = true;
    self.db.query("INSERT INTO config (`key`, `value`) VALUES (?, ?)" +
                  "ON DUPLICATE KEY UPDATE value = ?",
                  ['ledger_processed', start, start],
                  continueProcessing);
  }

  function continueProcessing(err) {
    self.processing = false;
    if (err) {
      logError(err);
      return;
    }

    start++;
    processLedger();
  }
};

Processor.prototype.processLedger = function (ledger_index, callback)
{
  var self = this;

  winston.info("Processing ledger "+ledger_index);

  self.getLedger(ledger_index, function (err, e) {
    if (err) callback(err);
    else clearLedger(e);
  });

  function clearLedger(e) {
    winston.debug("Clearing ledger "+ledger_index);
    self.db.query("DELETE FROM trades WHERE ledger = ?; "+
                  "DELETE FROM caps WHERE ledger = ?",
                  [ledger_index, ledger_index],
                  function (err)
    {
      if (err) callback(err);
      else analyzeLedger(e);
    });
  }

  function analyzeLedger(e) {
    try {
      winston.debug("Analyzing ledger "+ledger_index);

      var processed = Classifier.classifyLedger(e.ledger);

      writeTrades();

      function writeTrades()
      {
        if (processed.trades && processed.trades.length) {
          winston.debug("Inserting "+processed.trades.length+" trade(s) for ledger "+ledger_index);

          processed.trades.forEach(function (r) {
            cleanCache[""+r[0]+":"+r[1]+":"+r[2]+":"+r[3]] = false;
          });

          self.db.query("INSERT INTO `trades` " +
                        "(`c1`, `i1`, `c2`, `i2`," +
                        " `time`, `ledger`, `price`, `amount`," +
                        " `tx`, `order`) " +
                        "VALUES ?",
                        [processed.trades],
                        function (err)
                        {
                          if (err) logError(err);
                          model.set('reload', 'intraday');
                          writeCaps();
                        });
        } else {
          model.set('reload', 'none');
          writeCaps();
        }
      }

      function writeCaps(err)
      {
        if (err) return callback(err);

        if (processed.caps && processed.caps.length) {
          winston.debug("Inserting "+processed.caps.length+" caps for ledger "+ledger_index);

          self.db.query("INSERT INTO `caps` " +
                        "(`c`, `i`, `type`, " +
                        " `time`, `ledger`, `amount`) " +
                        "VALUES ?",
                        [processed.caps],
                        function (err)
                        {
                          if (err) logError(err);
                          writeLedger();
                        });
        } else writeLedger();
      }

      function writeLedger(err)
      {
        if (err) return callback(err);

        winston.debug("Inserting ledger "+ledger_index);

        self.db.query("REPLACE ledgers SET ?",
                      processed.ledger,
                      finish);
      }

      function finish(err) {
        if (err) return callback(err);

        self.emit('ledger_processed', processed, e);

        callback(null);
      }
    } catch (e) { callback(e); }
  }
};

Processor.prototype.updateAggregates = function () {
  var self = this;

  // XXX Re-add
  /*
  self.db.query("SELECT " +
                " accounts, txs_sum " +
                " FROM ledgers ORDER BY id DESC " +
                " LIMIT 0,1", function(err, rows)
  {
    if (err) logError(err);

    if(rows && rows[0]) {
      var account_count = rows[0].accounts || 0;
      var tx_count = rows[0].txs_sum || 0;
      model.set("account_count", account_count);
      model.set("tx_count", tx_count);
    }
  });*/

  _.each(index.issuerByCurrencyAddress, function (issuer1, key1) {
    _.each(index.issuerByCurrencyAddress, function (issuer2, key2) {
      if (key1 === key2) return;
      var i1 = issuer1.id,
          i2 = issuer2.id,
          c1 = index.currenciesByCode[key1.slice(0,3)].id,
     	  c2 = index.currenciesByCode[key2.slice(0,3)].id;
      if (c1 > c2 || (c1 === c2 && i1 > i2)) return;

      self.db.query("SELECT * FROM trades WHERE c1 = ? AND i1 = ? AND c2 = ? AND i2 = ? " +
                    "ORDER BY `time` DESC, `tx` DESC, `order` DESC LIMIT 0,1",
                    [c1, i1, c2, i2],
                    function (err, rows)
      {
        if (err) {
          logError(err);
          return;
        }

        if (rows[0]) {
          model.set("crosstickers."+key1+"."+key2+".last", ""+(rows[0].price));
        }
      });
    });
  });

  _.each(index.xrp, function (ticker, i) {
    if (cleanCache["0:0:"+ticker.cur.id+":"+ticker.iss.id]) return;

    winston.debug("Refreshing issuer "+ticker.first);

    self.db.query("SELECT * FROM trades WHERE c1 = 0 AND c2 = ? AND i2 = ? " +
                  "ORDER BY `time` DESC, `tx` DESC, `order` DESC LIMIT 0,1",
                  [ticker.cur.id, ticker.iss.id],
                  function (err, rows)
    {
      if (err) {
        logError(err);
        return;
      }

      if (rows[0]) {
        model.set("tickers."+ticker.first+".last", ""+Math.round(rows[0].price*1000000));
      }
    });
    //Caps
    self.db.query("SELECT amount FROM caps WHERE c = ? AND i = ? AND type = 1 ORDER BY ledger DESC LIMIT 0,1", 
                  [ticker.cur.id, ticker.iss.id],
                  function(err, rows) {
      if (err) logError(err);

      if(rows[0]) {
        model.set("tickers."+ticker.first+".hot", rows[0].amount);
      }
    });
    //Hots
    self.db.query("SELECT amount FROM caps WHERE c = ? AND i = ? AND type = 0 ORDER BY ledger DESC LIMIT 0,1", 
                  [ticker.cur.id, ticker.iss.id],
                  function(err, rows) {
      if (err) logError(err);

      if(rows[0]) {
        model.set("tickers."+ticker.first+".caps", rows[0].amount);
      }
    });

    [1, 30].forEach(function (days) {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      self.db.query("SELECT " +
                    "  SUM( `price` * `amount` ) / SUM( `amount` ) AS avg, " +
                    "  SUM( `amount` ) AS vol, " +
                    "  MIN( `price` ) AS lo, " +
                    "  MAX( `price` ) AS hi " +
                    "FROM trades WHERE " +
                    "`c1` = 0 AND `c2` = ? AND `i2` = ? AND time >= ?",
                    [ticker.cur.id, ticker.iss.id, cutoff],
                    function (err, rows)
      {
        if (err) logError(err);

        if (rows && rows[0]) {
          var data = {
            avg: ""+(rows[0].avg || 0),
            vol: ""+(rows[0].vol || 0),
            hi:  ""+(rows[0].hi  || 0),
            lo:  ""+(rows[0].lo  || 0)
          };
          model.set("tickers."+ticker.first+".d"+days, data);
          if (days === 30) {
            model.set("tickers."+ticker.first+".vol", data.vol * data.avg);
          }
        }
      });
    });

    cleanCache["0:0:"+ticker.cur.id+":"+ticker.iss.id] = true;
  });
};

exports.Processor = Processor;
