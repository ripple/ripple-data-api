function (doc) {
  if (doc.conflicting_ledger_headers && doc.conflicting_ledger_headers.length > 0) {
    emit(doc.ledger_index, doc);
  }
}