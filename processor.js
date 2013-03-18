var config = require('./config');
var mkt = require('./markets');

var Meta = require('ripple-lib').Meta;
var Amount = require('ripple-lib').Amount;
var utils = require('ripple-lib').utils;

var Processor = function (db, remote) {
  this.db = db;
  this.remote = remote;

  this.processing = false;
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
  self.processing = true;

  if (!vrange.is_member(config.net.genesis_ledger)) return;
  if (!vrange.is_member(start)) return;

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
      ledger.transactions.forEach(function (tx) {
        if (tx.metaData) {
          tx.meta = tx.metaData;
          delete tx.metaData;
        }

        if (tx.meta.TransactionResult !== 'tesSUCCESS' ||
            tx.TransactionType !== "Payment" &&
            tx.TransactionType !== "OfferCreate") return;

        // Process metadata
        tx.mmeta = new Meta(tx.meta);

        tx.mmeta.each(function (an) {
          if (an.entryType !== 'Offer') return;

          if (an.diffType === 'DeletedNode' ||
              an.diffType === 'ModifiedNode') {
            var trade_gets = Amount.from_json(an.fieldsPrev.TakerGets);
            var trade_pays = Amount.from_json(an.fieldsPrev.TakerPays);

            if (!trade_gets.is_valid() || !trade_pays.is_valid()) {
              console.log("TRADE (INVALID)");
              return;
            }

            var gets = trade_gets.currency().to_json();
            if (gets !== "XRP") gets += "/" + trade_gets.issuer().to_json();
            var pays = trade_pays.currency().to_json();
            if (pays !== "XRP") pays += "/" + trade_pays.issuer().to_json();

            if (an.diffType === 'ModifiedNode') {
              trade_gets = trade_gets.subtract(an.fieldsFinal.TakerGets);
              trade_pays = trade_pays.subtract(an.fieldsFinal.TakerPays);
            }

            var ticker, price, volume;
            if ((ticker = mkt.tickers[gets + ":" + pays])) {        // ASK
              price = Amount.from_json(an.fieldsPrev.TakerPays)
                .ratio_human(an.fieldsPrev.TakerGets);
              volume = Amount.from_json(an.fieldsPrev.TakerGets);
              if (an.diffType === 'ModifiedNode') {
                volume = volume.subtract(an.fieldsFinal.TakerGets);
              }
            } else if ((ticker = mkt.tickers[pays + ":" + gets])) { // BID
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
          }
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
