var _ = require('lodash');

var config = require('./config');
var mkt = require('./markets');
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
  _.each(mkt.tickers, function (ticker, i) {
    self.db.query("SELECT * FROM trades WHERE book = ? " +
                  "ORDER BY time DESC LIMIT 0,1",
                  [ticker.id],
                  function (err, rows)
    {
      if (err) console.error(err);

      if (rows[0]) {
        model.set("tickers."+i+".last", ""+(rows[0].price*1000000));
      }
    });
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
    self.processNextValidated(vrange, latest);
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
      console.error(err);
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

      ledger.transactions.forEach(function (tx) {
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

        nodes.forEach(function (an) {
          var trade_gets = Amount.from_json(an.fieldsPrev.TakerGets);
          var trade_pays = Amount.from_json(an.fieldsPrev.TakerPays);

          if (!trade_gets.is_valid() || !trade_pays.is_valid()) {
            console.log("TRADE (INVALID)");
            return;
          }

          an.gets = trade_gets.currency().to_json();
          if (an.gets !== "XRP") an.gets += "/" + trade_gets.issuer().to_json();
          an.pays = trade_pays.currency().to_json();
          if (an.pays !== "XRP") an.pays += "/" + trade_pays.issuer().to_json();

          an.sort = trade_gets.ratio_human(trade_pays).to_number();
        });
        nodes.sort(function (a, b) { return b.sort - a.sort; });

        nodes.forEach(function (an) {
          var ticker, price, volume;
          if ((ticker = mkt.tickers[an.gets + ":" + an.pays])) {        // ASK
            price = Amount.from_json(an.fieldsPrev.TakerPays)
              .ratio_human(an.fieldsPrev.TakerGets);
            volume = Amount.from_json(an.fieldsPrev.TakerGets);
            if (an.diffType === 'ModifiedNode') {
              volume = volume.subtract(an.fieldsFinal.TakerGets);
            }
          } else if ((ticker = mkt.tickers[an.pays + ":" + an.gets])) { // BID
            price = Amount.from_json(an.fieldsPrev.TakerGets)
              .ratio_human(an.fieldsPrev.TakerPays);
            volume = Amount.from_json(an.fieldsPrev.TakerPays);
            if (an.diffType === 'ModifiedNode') {
              volume = volume.subtract(an.fieldsFinal.TakerPays);
            }
          } else return;

          console.log("TRADE", ticker.sym, price.to_text_full(),
                      volume.to_text_full());

          rows.push([ticker.id, ledger_date, ledger_index,
                     price.is_native() ? price.to_number() / 1000000 : price.to_number(),
                     volume.is_native() ? volume.to_number() / 1000000 : volume.to_number()]);
        });
      });

      if (rows.length) {
        self.db.query("INSERT INTO trades" +
                      "(`book`, `time`, `ledger`, `price`, `amount`)" +
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

exports.Processor = Processor;
