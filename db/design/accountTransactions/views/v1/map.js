function(doc) {

  var time = new Date(doc.close_time_timestamp),
    unix   = Math.round(time.getTime()),
    timestamp = [
      time.getUTCFullYear(), 
      time.getUTCMonth(), 
      time.getUTCDate(),
      time.getUTCHours(), 
      time.getUTCMinutes(), 
      time.getUTCSeconds()
    ];

  doc.transactions.forEach(function(tx){

    if (tx.metaData.TransactionResult !== 'tesSUCCESS') return;

    if (tx.TransactionType === 'Payment') {
      var amount, currency, issuer = null;
      if (tx.Amount.value) {
        amount   = parseFloat(tx.Amount.value);
        currency = tx.Amount.currency;
        issuer   = tx.Amount.issuer;
      } else {
        amount   = parseFloat(tx.Amount) / 1000000.0;
        currency = "XRP";
      }
      
      emit([tx.Account].concat(timestamp),     [currency, issuer, "sent", amount, tx.Destination, unix, tx.hash]);
      emit([tx.Destination].concat(timestamp), [currency, issuer, "received", amount, tx.Account, unix, tx.hash]);
    }
  });
}