var _ = require('lodash');
var winston = require('winston');

var index = require('./indexes');

var Meta = require('ripple-lib').Meta;
var Amount = require('ripple-lib').Amount;
var utils = require('ripple-lib').utils;

var Classifier = {};

Classifier.classifyLedger = function (ledger)
{
  var processed = {
    ledger: {
      id: ledger.ledger_index,
      hash: ledger.ledger_hash,
      xrp: ledger.total_coins,
      accounts_delta: 0,
      txs: ledger.transactions.length,
      fees: 0,
      time: new Date(utils.toTimestamp(ledger.close_time)),
      txs_xrp_total: 0,
      txs_cross: 0,
      txs_trade: 0,
      txs_paytrade: 0,
      evt_trade: 0,
      entries_delta: 0,
      offers_placed: 0,
      offers_taken: 0,
      offers_canceled: 0
    },
    trades: [],
    caps: []
  };

  var caps_amount = {},
      hots_amount = {};

  if (!ledger.close_time) {
    callback(new Error("No ledger close time"));
    return;
  }

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

    // Transaction aggregates
    if (tx.TransactionType === "Payment" &&
        tx.meta.TransactionResult === "tesSUCCESS" &&
        !tx.Paths &&
        !tx.SendMax) {
      var xrpTransferred = Amount.from_json(tx.Amount).to_number() >>> 0;
      processed.ledger.txs_xrp_total += xrpTransferred;
		} else if (tx.TransactionType === "Payment" &&
              tx.meta.TransactionResult === "tesSUCCESS" &&
              tx.Paths && tx.Paths.length) {
      //txs_cross_total += Amount.from_json(tx.Amount).to_number() * 1;
      processed.ledger.txs_cross_total++;
    }

    // Fee aggregate
    processed.ledger.fees += Amount.from_json(tx.Fee).to_number();

    var isTradingTx = false,
        isTradingPay = false;

    tx.mmeta.each(function (an) {
      // Ledger entry count
      if (an.diffType === "CreatedNode") processed.ledger.entries_delta++;
      else if (an.diffType === "DeletedNode") processed.ledger.entries_delta--;

      // Offer metadata deltas
      if (an.nodeType === "Offer") {
        if (an.diffType === "CreatedNode") {
          processed.ledger.offers_placed++;
        } else if (an.diffType === "DeletedNode" &&
                   tx.TransactionType === "OfferCancel") {
          processed.ledger.offers_canceled++;
        } else if (an.diffType === "DeletedNode") {
          processed.ledger.offers_taken++;
        }
      }

      if (an.entryType === "Offer" &&
          (an.diffType === "ModifiedNode" ||
           (an.diffType === "DeletedNode" &&
            tx.TransactionType !== "OfferCancel"))) {
        processed.ledger.evt_trade++;
        isTradingTx = true;
        if (tx.TransactionType === "Payment") isTradingPay = true;
      }else if (an.entryType === "AccountRoot" && an.diffType === "CreatedNode") {
        processed.ledger.accounts_delta++;
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
    if (isTradingTx) processed.ledger.txs_trade++;
    if (isTradingPay) processed.ledger.txs_paytrade++;
  });

  // Capitalization processing
  _.each(caps_amount, function(amount, key) {
    var c = index.currenciesByCode[key.split(':')[0]].id,
        i = index.issuersByAddress[key.split(':')[1]].id;
    processed.caps.push([c, i, 1, processed.ledger.time, ledger.ledger_index, amount.to_number()]);
  });

  _.each(hots_amount, function(amount, key) {
    var c = index.currenciesByCode[key.split(':')[0]].id,
        i = index.issuersByAddress[key.split(':')[1]].id;
    processed.caps.push([c, i, 1, processed.ledger.time, ledger.ledger_index, amount.to_number()]);
  });

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
        price = price.invert();
      }

      winston.info("TRADE", price.to_text_full(), volume.to_text_full(),
                   an.reverse ? "ASK" : "BID");


      processed.trades.push([an.c1, an.i1, an.c2, an.i2, processed.ledger.time, ledger.ledger_index,
                      price.to_number(),
                      volume.is_native() ? volume.to_number() / 1000000 : volume.to_number(),
                      i_tx, i_an]);
    });
  });

  return processed;
};

exports.Classifier = Classifier;
