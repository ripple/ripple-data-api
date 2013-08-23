var _ = require('lodash');
var winston = require('winston');

var config = require('./config');
var index = require('./indexes');
var model = require('./model');

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

var Processor = function (db, remote) {
  this.db = db;
  this.remote = remote;

  this.processing = false;
};

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
    if (err) winston.error(err);

    if (rows[0]) {
      var ledger = rows[0];
      state.account_count = ledger.accounts;
      state.tx_count = ledger.txs;
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
 * Process old ledgers from the last processed until current.
 *
 * Looks up what the most recently processed ledger was, then starts processing
 * ledgers until it reaches the current one.
 */
Processor.prototype.processValidated = function (vrange)
{
  var self = this;

  if (self.processing) return;
  self.processing = true;

  self.db.query('SELECT value FROM config WHERE `key` = ?', ['ledger_processed'],
                function (err, rows)
  {
    self.processing = false;

    if (err) {
      winston.error(err);
      return;
    }

    var latest = Math.max(+(rows[0] && rows[0].value) || 0, config.net.genesis_ledger);
    self.processNextValidated(vrange, latest+1);
  });
};

Processor.prototype.processNextValidated = function (vrange, start)
{
  var self = this;

  if (self.processing) return;
  if (!vrange.is_member(start)) return;

  self.processing = true;

  self.processLedger(start, function (err) {
    self.processing = false;
    if (err) {
      winston.error(err.stack ? err.stack : err);
    } else {
      self.processNextValidated(vrange, start+1);
    }
  });
};

Processor.prototype.processLedger = function (ledger_index, callback)
{
  var self = this;

  winston.info("Processing ledger "+ledger_index);
  checkLedgerIndex('/meta/chunk-manifest.json', function(s3_chunk_index) {
    if(s3_chunk_index == 0 || ledger_index > s3_chunk_index) {
      checkLedgerIndex('/meta/ledger-manifest.json', function(s3_ledger_index) {
        if(s3_ledger_index == 0 || ledger_index > s3_ledger_index) requestRemoteLedger();
          else requestS3Ledger();
      });
    } else {
      requestS3Chunk();
    }
});

  //Request ledger data from S3 Chunk
  function requestS3Chunk() {
    console.log('Get from S3 chunk');
    client.list({prefix: 'chunk'}, function(err, data){
      if(data.Contents.length > 0) {
        data.Contents.sort(function(a, b) {
          return a.LastModified - b.LastModified;
        });

        _.each(data.Contents, function(item) {
          client.get(item.Key).on('response', function(res){
            var data = '';
            if(res.statusCode == 200) {
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
                  clearLedger(ledger);
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
    console.log('Get from S3 ledger');
    var read_file = '/ledger/'+ledger_index+'.json';
    client.get(read_file).on('response', function(res){
      var data = '';
      console.log(res.statusCode);
      if(res.statusCode == 200) {
        res.on('data', function(ledger) {
          data += ledger.toString();
        }).on('end', function() {
          var ledger_data = JSON.parse(data);
          clearLedger(ledger_data);
        });
      } else {
        requestRemoteLedger();
      }
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
          clearLedger(m);
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

  function clearLedger(e) {
    winston.debug("Clearing ledger "+ledger_index);
    self.db.query("DELETE FROM trades WHERE ledger = ?; "+
                  "DELETE FROM caps WHERE ledger = ?; "+
                  "DELETE FROM ledgers WHERE id = ?",
                  [ledger_index, ledger_index, ledger_index],
                  function (err)
    {
      if (err) callback(err);
      else analyzeLedger(e);
    });
  }

  function analyzeLedger(e) {
    try {
      winston.debug("Analyzing ledger "+ledger_index);

      var tradeRows = [],
          fees = Amount.from_json("0"),
          newAccounts = 0,
          txs_xrp_total = 0,
          txs_cross_total = 0,
          txs_trade = 0, 
          evt_trade = 0,
          txs_paytrade = 0,
          ledgerEntryCountDiff = 0,
          offers_placed = 0, 
          offers_taken = 0, 
          offers_canceled = 0;

      var caps_amount = {},
          hots_amount = {};

      var ledger = e.ledger;

      if (!ledger.close_time) {
        callback(new Error("No ledger close time"));
        return;
      }

      var ledger_date = new Date(utils.toTimestamp(ledger.close_time));

      // XXX Can be removed soon
      ledger.transactions.forEach(function (tx) {
        if (tx.metaData) {
          tx.meta = tx.metaData;
          delete tx.metaData;
        }
      });

      // Sort transaction into processed order.
      ledger.transactions.sort(function (a, b) {
        return a.meta.TransactionIndex - b.meta.TransactionIndex;
      });

      // Other data processing
      ledger.transactions.forEach(function (tx, i_tx) {
        // Process metadata
        tx.mmeta = new Meta(tx.meta);
        if (tx.TransactionType === "Payment" && tx.meta.TransactionResult === "tesSUCCESS" && !tx.Paths && !tx.SendMax) {
          txs_xrp_total += Amount.from_json(tx.Amount).to_number() * 1;
		}else if (tx.TransactionType === "Payment" && tx.meta.TransactionResult === "tesSUCCESS" && tx.Paths && tx.Paths.length) {
          //txs_cross_total += Amount.from_json(tx.Amount).to_number() * 1;
          txs_cross_total++;
        }
        fees = fees.add(Amount.from_json(tx.Fee));
        
        var isTradingTx = false,
            isTradingPay = false;

        tx.mmeta.each(function (an) {
          if (an.diffType === "CreatedNode") ledgerEntryCountDiff++;
          else if (an.diffType === "DeletedNode") ledgerEntryCountDiff--;
          if (an.nodeType === "Offer") {
            if (an.diffType === "CreatedNode") offers_placed++;
            else if (an.diffType === "DeletedNode" && tx.TransactionType === "OfferCancel") offers_canceled++;
            else if (an.diffType === "DeletedNode") offers_taken++;
          }
          if (an.entryType === "Offer" && (an.diffType === "ModifiedNode" || (an.diffType === "DeletedNode" && tx.TransactionType !== "OfferCancel"))) {
            evt_trade++;
            isTradingTx = true;
            if (tx.TransactionType === "Payment") isTradingPay = true;
          }else if (an.entryType === "AccountRoot" && an.diffType === "CreatedNode") {
            newAccounts++;
          } else if (an.entryType === "RippleState") {
            //Insert Capitalizations Data

            var cur, cur_issuer, account, balance_new, balance_old, negate = false;
            if ((cur_issuer = index.issuerByCurrencyAddress[an.fields.LowLimit.currency + ":" + an.fields.LowLimit.issuer])) {
              account = an.fields.LowLimit.issuer;
              cur = an.fields.LowLimit.currency;
              negate = true;
            } else if ((cur_issuer = index.issuerByCurrencyAddress[an.fields.HighLimit.currency + ":" + an.fields.HighLimit.issuer])) {
              account = an.fields.HighLimit.issuer;
              cur = an.fields.HighLimit.currency;
            } else return;

            var gateway = cur_issuer;

            balance_new = (an.diffType === "DeletedNode")
              ? Amount.from_json("0/"+cur+"/"+account)
              : Amount.from_json(an.fieldsFinal.Balance);
            balance_old = (an.diffType === "CreatedNode")
              ? Amount.from_json("0/"+cur+"/"+account)
              : Amount.from_json(an.fieldsPrev.Balance);

            if (negate) {
              balance_new = balance_new.negate();
              balance_old = balance_old.negate();
            }

            var balance_diff = balance_new.subtract(balance_old);
            var currency_id = index.currenciesByCode[cur].id;
            var issuer_id = cur_issuer.id;

            var type = 0;
            var hot_val = 0;
            var cap_val = 0;

            if (gateway.hotwallets && gateway.hotwallets[account]) {
              if (hots_amount[cur + ":" + account]) {
                hots_amount[cur + ":" + account] = hots_amount+[cur + ":" + account].add(balance_diff.to_number());
              } else {
                hots_amount[cur + ":" + account] = balance_diff;
              }
            } else {
              if (caps_amount[cur + ":" + account]) {
                caps_amount[cur + ":" + account] = caps_amount[cur + ":" + account].add(balance_diff.to_number());
              } else {
                caps_amount[cur + ":" + account] = balance_diff;
              }
            }
          }
        });
        if (isTradingTx) txs_trade++;
        if (isTradingPay) txs_paytrade++;
      });

      _.each(caps_amount, function(amount, key) {
        var i = index.issuersByAddress[key.split(':')[1]].id, 
            c = index.currenciesByCode[key.split(':')[0]].id;
        var cap_val = 0,
            type = 0;
        self.db.query("SELECT amount FROM caps WHERE c = ? AND i = ? AND type = 0 AND ledger < ? ORDER BY ledger DESC LIMIT 0,1", 
                      [c, i, ledger_index], 
                      function(err, rows) {
          if (err) winston.error(err);
          if(rows && rows[0]) {
            cap_val = amount.to_number() + rows[0].amount;
            write_caps(c, i, type, ledger_date, ledger_index, cap_val);
          }
        });
      });

      _.each(hots_amount, function(amount, key) {
        var i = index.issuersByAddress[key.split(':')[1]].id, 
            c = index.currenciesByCode[key.split(':')[0]].id;
        var hot_val = 0,
            type = 1;
        self.db.query("SELECT amount FROM caps WHERE c = ? AND i = ? AND type = 1 AND ledger < ? ORDER BY ledger DESC LIMIT 0,1", 
                      [c, i, ledger_index], 
                      function(err, rows) {
          if (err) winston.error(err);
          if(rows && rows[0]) {
            hot_val = amount.to_number() + rows[0].amount;
            write_caps(c, i, type, ledger_date, ledger_index, hot_val);
          }
        });
      });

      function write_caps(c, i, type, time, ledger, amount) {
        self.db.query("INSERT INTO caps (c, i, type, time, ledger, amount) VALUES (?, ?, ?, ?, ?, ?)",
                      [c, i, type, time, ledger, amount],
          function (err) {
            if (err) winston.error(err);
        });
      }

      // Trade processing
      ledger.transactions.forEach(function (tx, i_tx) {
        if (tx.meta.TransactionResult !== 'tesSUCCESS' ||
            tx.TransactionType !== "Payment" &&
            tx.TransactionType !== "OfferCreate") return;

        var nodes = tx.mmeta.nodes;

        nodes = _.filter(nodes, function (an) {
          return (an.entryType === 'Offer' &&
                  (an.diffType === 'DeletedNode' ||
                   an.diffType === 'ModifiedNode') &&
                  an.fieldsPrev.TakerGets &&
                  an.fieldsPrev.TakerPays);
        });

        nodes = _.filter(nodes, function (an) {
          var trade_gets = Amount.from_json(an.fieldsPrev.TakerGets);
          var trade_pays = Amount.from_json(an.fieldsPrev.TakerPays);

          if (!trade_gets.is_valid() || !trade_pays.is_valid()) {
            winston.error("TRADE ERR (INVALID AMNTS)");
            return false;
          }

          //console.log("TRADE PREFILTER", trade_gets.to_text_full(), trade_pays.to_text_full());

          // Make sure the gets currency is one we're tracking
          var cg = index.currenciesByCode[trade_gets.currency().to_json()];
          if (!cg) return false;

          // Make sure the pays currency is one we're tracking
          var cp = index.currenciesByCode[trade_pays.currency().to_json()];
          if (!cp) return false;

          // Make sure the gets issuer is one we're tracking
          var ig = (cg.id === 0) ? {id: 0} :
                index.issuersByAddress[trade_gets.issuer().to_json()];
          if (!ig) return false;

          // Make sure the pays issuer is one we're tracking
          var ip = (cp.id === 0) ? {id: 0} :
                index.issuersByAddress[trade_pays.issuer().to_json()];
          if (!ip) return false;

          //console.log("TRADE POSTFILTER");

          if (cg.id === cp.id && ig.id === ip.id) {
            winston.error("TRADE ERR (SAME FOR SAME)");
            return false;
          }

          // Pair ordering determined by IDs
          if (cg.id < cp.id || (cg.id === cp.id && ig.id < ip.id)) {
            an.reverse = false;
          } else {
            an.reverse = true;
          }

          an.c1 = an.reverse ? cp.id : cg.id;
          an.c2 = an.reverse ? cg.id : cp.id;
          an.i1 = an.reverse ? ip.id : ig.id;
          an.i2 = an.reverse ? ig.id : ip.id;

          var price = Amount.from_quality(an.fieldsFinal.BookDirectory, "1", "1");

          var takerGets = Amount.from_json(an.fieldsPrev.TakerGets),
              takerPays = Amount.from_json(an.fieldsPrev.TakerPays);

          if (takerPays.is_native()) {
            // Adjust for drops: The result would be a million times too large.
            price = price.divide(Amount.from_json("1000000"));
          }

          if (takerGets.is_native()) {
            // Adjust for drops: The result would be a million times too small.
            price = price.multiply(Amount.from_json("1000000"));
          }

          an.price = price;
          an.sort = price.to_number();

          return true;
        });

        nodes.sort(function (a, b) { return b.sort - a.sort; });

        _.each(nodes, function (an, i_an) {
          var price, volume;

          price = an.price;

          if (an.reverse) {        // ASK
            volume = Amount.from_json(an.fieldsPrev.TakerGets);
            if (an.diffType === 'ModifiedNode') {
              volume = volume.subtract(an.fieldsFinal.TakerGets);
            }
          } else { // BID
            volume = Amount.from_json(an.fieldsPrev.TakerPays);
            if (an.diffType === 'ModifiedNode') {
              volume = volume.subtract(an.fieldsFinal.TakerPays);
            }

            // It's confusing, but we need to invert the book price if an.reverse
            // is *false*.
            //price = price.invert();
          }

          winston.info("TRADE", price.to_text_full(), volume.to_text_full());

          cleanCache[""+an.c1+":"+an.i1+":"+an.c2+":"+an.i2] = false;

          tradeRows.push([an.c1, an.i1, an.c2, an.i2, ledger_date, ledger_index,
                          price.to_number(),
                          volume.is_native() ? volume.to_number() / 1000000 : volume.to_number(),
                          i_tx, i_an]);
        });
      });

      if (tradeRows.length) {
        winston.debug("Inserting "+tradeRows.length+" trade(s) for ledger "+ledger_index);

        self.db.query("INSERT INTO trades " +
                      "(`c1`, `i1`, `c2`, `i2`," +
                      " `time`, `ledger`, `price`, `amount`," +
                      " `tx`, `order`) " +
                      "VALUES ?",
                      [tradeRows],
                      function (err)
                      {
                        if (err) winston.error(err);
                        model.set('reload', 'intraday');
                        writeLedger();
                      });
      } else {
        model.set('reload', 'none');
        writeLedger();
      }

      function writeLedger(err)
      {
        if (err) return callback(err);

        winston.debug("Inserting ledger "+ledger_index);

        self.db.query("INSERT INTO ledgers " +
                      "(`id`, `hash`, `xrp`, `accounts`, `txs`, `fees`, `time`, `txs_xrp_total`, `txs_cross`, `txs_trade`, " +
                      "`evt_trade`, `entries`, `offers_placed`, `offers_taken`, `offers_canceled`) " +
                      "SELECT ?, ?, ?, `accounts` + ?, ?, ?, ?, ?, ?, ?, ?, `entries` + ?, ?, ?, ? " +
                      "FROM ledgers " +
                      "WHERE `id` = (SELECT MAX(`id`) FROM `ledgers`)",
                      [ledger_index, ledger.ledger_hash, ledger.total_coins,
                       newAccounts, ledger.transactions.length, fees.to_number(), ledger_date,
                       txs_xrp_total, txs_cross_total, txs_trade, evt_trade, ledgerEntryCountDiff, offers_placed, offers_taken, offers_canceled],
                      updateStatus);
      }
    } catch (e) { callback(e); }
  }


  function updateStatus(err) {
    if (err) return callback(err);

    winston.debug("Updating process status to "+ledger_index);

    self.db.query("INSERT INTO config (`key`, `value`) VALUES (?, ?)" +
                  "ON DUPLICATE KEY UPDATE value = ?",
                  ['ledger_processed', ledger_index, ledger_index],
                  function (err)
    {
      callback(err);
    });
  }
};

Processor.prototype.updateAggregates = function () {
  var self = this;

  self.db.query("SELECT " +
                " accounts, txs " +
                " FROM ledgers ORDER BY id DESC " +
                " LIMIT 0,1", function(err, rows)
  {
    if (err) winston.error(err);

    if(rows && rows[0]) {
      var account_count = rows[0].accounts || 0;
      var tx_count = rows[0].txs || 0;
      model.set("account_count", account_count);
      model.set("tx_count", tx_count);
    }
  });

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
          winston.error(err);
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
        winston.error(err);
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
      if (err) winston.error(err);

      if(rows[0]) {
        model.set("tickers."+ticker.first+".hot", rows[0].amount);
      }
    });
    //Hots
    self.db.query("SELECT amount FROM caps WHERE c = ? AND i = ? AND type = 0 ORDER BY ledger DESC LIMIT 0,1", 
                  [ticker.cur.id, ticker.iss.id],
                  function(err, rows) {
      if (err) winston.error(err);

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
        if (err) winston.error(err);

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
