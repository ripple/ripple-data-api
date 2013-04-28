var extend = require('extend'),
    Order = require('./lib/order').Order,
    OrderBook = require('./lib/orderbook').OrderBook,
    Amount = require('ripple-lib').Amount;

var _ = require('lodash');

var index = require('./indexes');

/**
 * Metadata format:
 *
 *   {
 *     // Type of diff, e.g. CreatedNode, ModifiedNode
 *     diffType: 'CreatedNode'
 *
 *     // Type of node affected, e.g. RippleState, AccountRoot
 *     entryType: 'RippleState',
 *
 *     // Index of the ledger this change occurred in
 *     ledgerIndex: '01AB01AB...',
 *
 *     // Contains all fields with later versions taking precedence
 *     //
 *     // This is a shorthand for doing things like checking which account
 *     // this affected without having to check the diffType.
 *     fields: {...},
 *
 *     // Old fields (before the change)
 *     fieldsPrev: {...},
 *
 *     // New fields (that have been added)
 *     fieldsNew: {...},
 *
 *     // Changed fields
 *     fieldsFinal: {...}
 *   }
 */

var accounts = {};
var orderbooks = {};
var orders = {};
var currencies = {};
var tickers = {};

var currenciesById = {};

exports.applyLedger = function (model, e) {
  if (!e.ledger || !e.ledger.accountState) {
    console.error('Incomplete response to ledger download');
    console.log(new Error().stack);
    return;
  }

  accounts = {};
  orderbooks = {};
  currencies = {};
  tickers = {};
  _.each(index.issuers, function (data) {
    _.each(data.currencies, function (issuer, currency) {
      currencies[currency + ":" + issuer] = {
        cur: currency,
        iss: issuer,
        gat: data.id,
        dat: data,
        cap: Amount.from_json("0/"+currency+"/"+issuer),
        hot: Amount.from_json("0/"+currency+"/"+issuer)
      };
    });
  });
  _.each(index.xrp, function (data) {
    // Initialize field with basic properties
    tickers[data.first] = {
      sym: data.sym,
      first: data.first,
      second: "XRP",
      bid: Amount.from_json("0"),
      ask: Amount.from_json("0"),
      last: Amount.from_json("0"),
      vol: Amount.from_json("0/"+data.first)
    };
  });

  e.ledger.accountState.forEach(function (node) {
    //console.log(node.LedgerEntryType);
    switch (node.LedgerEntryType) {
    case 'AccountRoot':
      accounts[node.Account] = {
      };
      break;
    case 'RippleState':
      var cur, account, balance;
      if (currencies[node.LowLimit.currency + ":" + node.LowLimit.issuer]) {
        cur = currencies[node.LowLimit.currency + ":" + node.LowLimit.issuer];
        account = node.HighLimit.issuer;
        balance = Amount.from_json(node.Balance).negate();
      } else if (currencies[node.HighLimit.currency + ":" + node.HighLimit.issuer]) {
        cur = currencies[node.HighLimit.currency + ":" + node.HighLimit.issuer];
        account = node.LowLimit.issuer;
        balance = Amount.from_json(node.Balance);
      } else return;

      if (cur.dat.hotwallets && cur.dat.hotwallets[account]) {
        cur.hot = cur.hot.add(balance);
      } else {
        cur.cap = cur.cap.add(balance);
      }
      break;
    case 'Offer':
      var order = new Order(node),
          key = order.getKey();
      if ("undefined" === typeof key) return;
//      if (!orderbooks[key]) orderbooks[key] = new OrderBook();
//      orderbooks[key].add(order);
//      orders[order.id] = order;
      break;
    }
  });

  currencies = _.values(currencies);
  currencies = _.sortBy(currencies, function (a) {
    return -a.cap.to_text();
  });
  var currencyOrder = _.pluck(index.currencies.slice(1), 'cur');
  currencies = _.sortBy(currencies, function (v, k) {
    return currencyOrder.indexOf(v.cur);
  });
  currencies = _.map(currencies, function (data, currency) {
    data.cap = data.cap.to_json();
    if (!data.dat.hotwallets) delete data.hot;
    else data.hot = data.hot.to_json();

    delete data.dat;

    // Index
    currenciesById[data.cur + ":" + data.iss] = data;

    return data;
  });

  _.each(tickers, function (data) {
    data.bid = data.bid.to_json();
    data.ask = data.ask.to_json();
    data.last = data.last.to_json();
    data.vol = data.vol.to_json();
  });

  model.apply({
    ledger_index: e.ledger.seqNum,
    ledger_hash: e.ledger.hash,
    account_count: Object.keys(accounts).length,
    currencies: currencies,
    tickers: tickers,
    issuers: index.issuers
  });
};

exports.applyTransaction = function (model, e) {
  var modelDiff = {};

  if (e.meta.TransactionResult !== 'tesSUCCESS' ||
      e.transaction.TransactionType !== "Payment" &&
      e.transaction.TransactionType !== "OfferCreate") return;

  e.mmeta.each(function (an) {
    if (an.entryType === "AccountRoot") {
      if (an.diffType === 'CreatedNode') {
        accounts[an.fields.Account] = {};
      } else if (an.diffType === 'DeletedNode') {
        delete accounts[an.fields.Account];
      }
    } else if (an.entryType === "Offer") {
      if ((an.diffType === 'ModifiedNode' ||
           an.diffType === 'DeletedNode') &&
          an.fieldsPrev.TakerGets &&
          an.fieldsPrev.TakerPays) {

        var gets = Amount.from_json(an.fields.TakerGets);
        var getsStr = gets.currency().to_json();
        if (getsStr !== 'XRP') getsStr += '/' + gets.issuer().to_json();
        var pays = Amount.from_json(an.fields.TakerPays);
        var paysStr = pays.currency().to_json();
        if (paysStr !== 'XRP') paysStr += '/' + pays.issuer().to_json();

        var ticker, price, volume;
        if ((ticker = tickers[getsStr + ":" + paysStr])) {        // ASK
          price = Amount.from_json(an.fieldsPrev.TakerPays)
            .ratio_human(an.fieldsPrev.TakerGets);
          volume = Amount.from_json(an.fieldsPrev.TakerGets);
          if (an.diffType === 'ModifiedNode') {
            volume = volume.subtract(an.fieldsFinal.TakerGets);
          }
        } else if ((ticker = tickers[paysStr + ":" + getsStr])) { // BID
          price = Amount.from_json(an.fieldsPrev.TakerGets)
            .ratio_human(an.fieldsPrev.TakerPays);
          volume = Amount.from_json(an.fieldsPrev.TakerPays);
          if (an.diffType === 'ModifiedNode') {
            volume = volume.subtract(an.fieldsFinal.TakerPays);
          }
        } else return;

        console.log("TRADE (LIVE)", price.to_text_full(), volume.to_text_full());
      }
    } else if (an.entryType === "RippleState") {
      var cur, account, balance_new, balance_old, negate = false;
      if ((cur = currenciesById[an.fields.LowLimit.currency + ":" + an.fields.LowLimit.issuer])) {
        account = an.fields.HighLimit.issuer;
        negate = true;
      } else if ((cur = currenciesById[an.fields.HighLimit.currency + ":" + an.fields.HighLimit.issuer])) {
        account = an.fields.LowLimit.issuer;
      } else return;

      var gateway = index.issuers[cur.gat];

      balance_new = (an.diffType === "DeletedNode")
        ? Amount.from_json("0/"+cur.cur+"/"+cur.iss)
        : Amount.from_json(an.fieldsFinal.Balance);
      balance_old = (an.diffType === "CreatedNode")
        ? Amount.from_json("0/"+cur.cur+"/"+cur.iss)
        : Amount.from_json(an.fieldsPrev.Balance);

      if (negate) {
        balance_new = balance_new.negate();
        balance_old = balance_old.negate();
      }

      var balance_diff = balance_new.subtract(balance_old);

      // if (!balance_diff.is_zero())

      if (gateway.hotwallets && gateway.hotwallets[account]) {
        cur.hot = Amount.from_json(cur.hot).add(balance_diff).to_json();

        console.log("HOT", cur.gat, cur.cur, balance_diff.to_text(), Amount.from_json(cur.hot).to_text());
      } else {
        cur.cap = Amount.from_json(cur.cap).add(balance_diff).to_json();

        console.log("CAP", cur.gat, cur.cur, balance_diff.to_text(), Amount.from_json(cur.cap).to_text());
      }

      modelDiff.currencies = currencies;
    }
  });

  modelDiff.account_count = Object.keys(accounts).length;

  model.apply(modelDiff);
};
