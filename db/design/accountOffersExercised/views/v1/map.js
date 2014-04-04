function(doc) {

  var time    = new Date(doc.close_time_timestamp),
    unix      = Math.round(time.getTime()),
    timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(),
      time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()
    ];

  doc.transactions.forEach(function(tx) {

    if (tx.metaData.TransactionResult !== 'tesSUCCESS') {
      return;
    }

    if (tx.TransactionType !== 'Payment' && tx.TransactionType !== 'OfferCreate') {
      return;
    }

    tx.metaData.AffectedNodes.forEach(function(affNode) {

      var node = affNode.ModifiedNode || affNode.DeletedNode;

      if (!node || node.LedgerEntryType !== 'Offer') {
        return;
      }

      if (!node.PreviousFields || !node.PreviousFields.TakerPays || !node.PreviousFields.TakerGets) {
        return;
      }
  
      var exchangeRate = node.exchange_rate,
        counterparty   = node.FinalFields.Account,
        pay, get;

      if ( typeof node.PreviousFields.TakerPays === "object" ) {
        pay = {
          currency : node.PreviousFields.TakerPays.currency,
          issuer   : node.PreviousFields.TakerPays.issuer,
          value    : node.PreviousFields.TakerPays.value - node.FinalFields.TakerPays.value
        }
        
      } else {
        exchangeRate = exchangeRate / 1000000.0;        
        pay = {
          currency : "XRP",
          issuer   : null,
          value    : (node.PreviousFields.TakerPays - node.FinalFields.TakerPays) / 1000000.0, // convert from drops
        }
      }

      if ( typeof node.PreviousFields.TakerGets === "object" ) {
        get = {
          currency : node.PreviousFields.TakerGets.currency,
          issuer   : node.PreviousFields.TakerGets.issuer,
          value    : node.PreviousFields.TakerGets.value - node.FinalFields.TakerGets.value
        }
        
      } else {
        exchangeRate = exchangeRate * 1000000.0;
        get = {
          currency : "XRP",
          issuer   : null,
          value    : (node.PreviousFields.TakerGets - node.FinalFields.TakerGets) / 1000000.0
        }
      }
      
      emit([tx.Account].concat(timestamp), [
        pay.currency, 
        pay.issuer, 
        pay.value, 
        get.currency,
        get.issuer,
        get.value,
        "buy", //account is buying the base (1st) currency
        exchangeRate,
        counterparty,
        unix,
        tx.hash
      ]);
        
      emit([counterparty].concat(timestamp), [
        get.currency,
        get.issuer,
        get.value,
        pay.currency, 
        pay.issuer, 
        pay.value, 
        "sell",  //account is selling the base (1st) currency
        (1 / exchangeRate),
        tx.Account,
        unix,
        tx.hash
      ]); 
         
    });
  });
}