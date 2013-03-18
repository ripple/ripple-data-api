var extend = require('extend'),
    Order = require('./lib/order').Order,
    OrderBook = require('./lib/orderbook').OrderBook,
    Amount = require('ripple-lib').Amount;

var _ = require('lodash');

var mkt = require('./markets');
var issuers = mkt.issuers;
var markets = mkt.markets;

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
exports.applyLedger = function (model, e) {
  accounts = {};
  orderbooks = {};
  currencies = {};
  tickers = {};
  _.each(issuers, function (data, gateway) {
    _.each(data.currencies, function (issuer, currency) {
      currencies[currency + ":" + issuer] = {
        cur: currency,
        iss: issuer,
        gat: gateway,
        dat: data,
        cap: Amount.from_json("0/"+currency+"/"+issuer),
        hot: Amount.from_json("0/"+currency+"/"+issuer)
      };
    });
  });
  _.each(mkt.tickers, function (data) {
    // Initialize field with basic properties
    tickers[data.first + ':' + data.second] = {
      sym: data.sym,
      first: data.first,
      second: data.second,
      bid: Amount.from_json("0/"+data.second),
      ask: Amount.from_json("0/"+data.second),
      last: Amount.from_json("0/"+data.second),
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
  currencies = _.sortBy(currencies, function (v, k) {
    return ['BTC', 'USD', 'CAD', 'AUD'].indexOf(v.cur);
  });
  currencies = _.map(currencies, function (data, currency) {
    data.cap = data.cap.to_json();
    if (!data.dat.hotwallets) delete data.hot;
    else data.hot = data.hot.to_json();

    delete data.dat;
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
    tickers: tickers
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

        ticker.last = price.to_json();
        ticker.vol = Amount.from_json(ticker.vol).add(volume).to_json();
        if (!ticker.min || Amount.from_json(ticker.min).compareTo(price) > 0)
          ticker.min = price.to_json();
        if (!ticker.max || Amount.from_json(ticker.max).compareTo(price) < 0)
          ticker.max = price.to_json();

        modelDiff.tickers = tickers;
      }
    } else if (an.entryType === "RippleState") {

      var cur, account, balance_new, balance_old, negate = false;
      if (currencies[an.fields.LowLimit.currency + ":" + an.fields.LowLimit.issuer]) {
        cur = currencies[an.fields.LowLimit.currency + ":" + an.fields.LowLimit.issuer];
        account = an.fields.HighLimit.issuer;
        negate = true;
      } else if (currencies[an.fields.HighLimit.currency + ":" + an.fields.HighLimit.issuer]) {
        cur = currencies[an.fields.HighLimit.currency + ":" + an.fields.HighLimit.issuer];
        account = an.fields.LowLimit.issuer;
      } else return;

      balance_new = an.diffType === "DeletedNode"
        ? Amount.from_json(an.fieldsFinal.Balance)
        : Amount.from_json("0/"+cur.cur+"/"+cur.iss);
      balance_old = an.diffType === "CreatedNode"
        ? Amount.from_json("0/"+cur.cur+"/"+cur.iss)
        : Amount.from_json(an.fieldsPrev.Balance);

      if (negate) {
        balance_new = balance_new.negate();
        balance_old = balance_old.negate();
      }

      var balance_diff = balance_new.subtract(balance_old);

      // if (!balance_diff.is_zero())

      if (cur.dat.hotwallets && cur.dat.hotwallets[account]) {
        cur.hot = Amount.from_json(cur.hot).add(balance_diff).to_json();
      } else {
        cur.cap = Amount.from_json(cur.cap).add(balance_diff).to_json();
      }

      modelDiff.currencies = currencies;
    }
  });

  modelDiff.account_count = Object.keys(accounts).length;

  model.apply(modelDiff);
};
