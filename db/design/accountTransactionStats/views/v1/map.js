function(doc) {

  var time    = new Date(doc.close_time_timestamp),
    unix      = Math.round(time.getTime()),
    timestamp = [
      time.getUTCFullYear(), 
      time.getUTCMonth(), 
      time.getUTCDate(),
      time.getUTCHours(), 
      time.getUTCMinutes(), 
      time.getUTCSeconds()
    ];

  doc.transactions.forEach(function(tx) {

    //only include successful transactions
    if (tx.metaData.TransactionResult !== 'tesSUCCESS') return;

    emit([tx.Account].concat(timestamp), [tx.TransactionType, unix, tx.hash]);
  });
}