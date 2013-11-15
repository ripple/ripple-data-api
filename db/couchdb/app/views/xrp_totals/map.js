function(doc) {
  var transactions = doc.transactions;

  var time = new Date(doc.close_time_timestamp),
      timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(), 
                   time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];

  var ledger_index = doc.ledger_index;
      
  for (var i = 0, n = transactions && transactions.length; i < n; ++i) {
    var t = transactions[i],
        meta = t.metaData,
        affected = meta.AffectedNodes;
    if (meta.TransactionResult !== "tesSUCCESS") continue;
    for (var j = 0; j < affected.length; ++j) {
      var a = affected[j],
          node = a.ModifiedNode || a.CreatedNode || a.DeletedNode,
          fields;
      if (!node || node.LedgerEntryType !== "AccountRoot") continue;
      if (a.DeletedNode) log("deleted account!");
      if (fields = node.FinalFields || node.NewFields) {
        emit([fields.Account].concat(timestamp), parseInt(fields.Balance, 10));
      }
    }
  }
}