var _ = require('lodash');

var config = require('./config');
var index = require('./indexes');
var model = require('./model');

var Meta = require('ripple-lib').Meta;
var Amount = require('ripple-lib').Amount;
var utils = require('ripple-lib').utils;

var Processor = function (db, remote) {
  this.db = db;
  this.remote = remote;

  this.processing = false;
};

Processor.prototype.loadState = function ()
{
  var self = this;

  _.each(index.xrp, function (ticker, i) {
    self.db.query("SELECT * FROM trades WHERE c1 = 0 AND c2 = ? AND i2 = ? " +
                  "ORDER BY time DESC LIMIT 0,1",
                  [ticker.cur.id, ticker.iss.id],
                  function (err, rows)
    {
      if (err) console.error(err);

      if (rows[0]) {
        model.set("tickers."+ticker.first+".last", ""+(rows[0].price*1000000));
      }
    });
    self.updateAggregates();
  });
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
      console.error(err);
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

  if (!vrange.is_member(config.net.genesis_ledger)) return;
  if (!vrange.is_member(start)) return;

  self.processing = true;

  self.processLedger(start, function (err) {
    self.processing = false;

    if (err) {
      console.error(err.stack ? err.stack : err);
    } else {
      self.processNextValidated(vrange, start+1);
    }
  });
};

Processor.prototype.processLedger = function (ledger_index, callback)
{
  var self = this;

  console.log("Processing ledger "+ledger_index);

  clearLedger();

  function clearLedger() {
    self.db.query("DELETE FROM trades WHERE ledger = ?",
                  [ledger_index],
                  function (err)
    {
      if (err) callback(err);
      else requestLedger();
    });
  }

  function requestLedger() {
    try {
      self.remote.request_ledger(undefined, { transactions: true, expand: true })
        .ledger_index(ledger_index)
        .on('error', function (err) {
          callback(err);
        })
        .on('success', function (m) {
          processLedger(m);
        })
        .request()
      ;
    } catch(e) { callback(e); }
  }

  function processLedger(e) {
    try {
      var rows = [];

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

      ledger.transactions.forEach(function (tx, i_tx) {
        if (tx.meta.TransactionResult !== 'tesSUCCESS' ||
            tx.TransactionType !== "Payment" &&
            tx.TransactionType !== "OfferCreate") return;

        // Process metadata
        tx.mmeta = new Meta(tx.meta);
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
            console.log("TRADE ERR (INVALID AMNTS)");
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
            console.log("TRADE ERR (SAME FOR SAME)");
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

          an.sort = trade_gets.ratio_human(trade_pays).to_number();

          return true;
        });
        nodes.sort(function (a, b) { return b.sort - a.sort; });

        nodes.forEach(function (an, i_an) {
          var price, volume;
          if (an.reverse) {        // ASK
            price = Amount.from_json(an.fieldsPrev.TakerPays)
              .ratio_human(an.fieldsPrev.TakerGets);
            volume = Amount.from_json(an.fieldsPrev.TakerGets);
            if (an.diffType === 'ModifiedNode') {
              volume = volume.subtract(an.fieldsFinal.TakerGets);
            }
          } else { // BID
            price = Amount.from_json(an.fieldsPrev.TakerGets)
              .ratio_human(an.fieldsPrev.TakerPays);
            volume = Amount.from_json(an.fieldsPrev.TakerPays);
            if (an.diffType === 'ModifiedNode') {
              volume = volume.subtract(an.fieldsFinal.TakerPays);
            }
          }

          console.log("TRADE", price.to_text_full(), volume.to_text_full());

          rows.push([an.c1, an.i1, an.c2, an.i2, ledger_date, ledger_index,
                     price.is_native() ? price.to_number() / 1000000 : price.to_number(),
                     volume.is_native() ? volume.to_number() / 1000000 : volume.to_number(),
                     i_tx, i_an]);
        });
      });

      if (rows.length) {
        self.db.query("INSERT INTO trades" +
                      "(`c1`, `i1`, `c2`, `i2`," +
                      " `time`, `ledger`, `price`, `amount`," +
                      " `tx`, `order`)" +
                      "VALUES ?",
                      [rows],
                      function (err)
                      {
                        if (err) console.error(err);

                        updateStatus();
                      });
      } else {
        updateStatus();
      }
    } catch (e) { callback(e); }
  }

  function updateStatus() {
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
  _.each(index.xrp, function (ticker, i) {
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
        if (err) console.error(err);

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
  });
};

exports.Processor = Processor;
