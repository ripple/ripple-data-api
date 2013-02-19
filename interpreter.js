var extend = require('extend'),
    Order = require('./lib/order').Order,
    OrderBook = require('./lib/orderbook').OrderBook;

/**
 * Takes a metadata affected node and returns a simpler JSON object.
 *
 * The resulting object looks like this:
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
function processAnode(an) {
  var result = {};

  ["CreatedNode", "ModifiedNode", "DeletedNode"].forEach(function (x) {
    if (an[x]) result.diffType = x;
  });

  if (!result.diffType) return null;

  an = an[result.diffType];

  result.entryType = an.LedgerEntryType;
  result.ledgerIndex = an.LedgerIndex;

  result.fields = extend({}, an.PreviousFields, an.NewFields, an.FinalFields);
  result.fieldsPrev = an.PreviousFields || {};
  result.fieldsNew = an.NewFields || {};
  result.fieldsFinal = an.FinalFields || {};

  return result;
}

var accounts = {};
var orderbooks = {};
var orders = {};
exports.applyLedger = function (model, e) {
  var pairs = [
    'AUD/rBcYpuDT1aXNo4jnqczWJTytKGdBGufsre|XRP'
  ];

  accounts = {};
  orderbooks = {};
  e.ledger.accountState.forEach(function (node) {
    switch (node.LedgerEntryType) {
    case 'AccountRoot':
      accounts[node.Account] = {
      };
      break;
    case 'Offer':
      var order = new Order(node),
          key = order.getKey();
      if ("undefined" === typeof key) return;
      //if (pairs.indexOf(key) === -1) return;
      if (!orderbooks[key]) orderbooks[key] = new OrderBook();
      orderbooks[key].add(order);
      orders[order.id] = order;
      break;
    }
  });
  model.apply({
    ledger_index: e.ledger.seqNum,
    ledger_hash: e.ledger.hash,
    account_count: Object.keys(accounts).length,
    order_books: orderbooks
  });
};

exports.applyTransaction = function (model, e) {
  e.meta.AffectedNodes.forEach(function (node) {
    var an = processAnode(node);

    if (an.entryType === "AccountRoot") {
      if (an.diffType === 'CreatedNode') {
        accounts[an.fields.Account] = {};
      } else if (an.diffType === 'DeletedNode') {
        delete accounts[an.fields.Account];
      }
    } else if (an.entryType === "Offer") {
      console.log(an);
    }
  });

  model.apply({
    account_count: Object.keys(accounts).length
  });
};
