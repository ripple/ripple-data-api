var extend = require('extend');

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
exports.applyLedger = function (model, e) {
  accounts = {};
  e.ledger.accountState.forEach(function (node) {
    switch (node.LedgerEntryType) {
    case 'AccountRoot':
      accounts[node.Account] = {
      };
      break;
    }
  });
  model.apply({
    account_count: Object.keys(accounts).length,
    ledger_hash: e.ledger.hash,
    ledger_index: e.ledger.seqNum
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
    }
  });

  model.apply({
    account_count: Object.keys(accounts).length
  });
};
