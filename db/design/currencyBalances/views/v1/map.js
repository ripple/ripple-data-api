function (doc) {

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

  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== "tesSUCCESS" ) {
      return;
    }

    tx.metaData.AffectedNodes.forEach( function( affNode ) {
      var node = affNode.ModifiedNode || affNode.CreatedNode || affNode.DeletedNode;
    
      if (!node) return;
      if (node.LedgerEntryType === "AccountRoot" ) {
      
        var fields = node.FinalFields || node.NewFields;
          balance, previous, change;
          
        if (fields) {
          balance  = fields.Balance,
          previous = node.PreviousFields ? node.PreviousFields.Balance : 0,
          change   = (balance - previous) / 1000000.0;
            
          balance  = balance / 1000000.0; //convert to XRP
         
          emit(["XRP"].concat(timestamp), [fields.Account, balance, change, unix, tx.hash]);
        } 
      
      } else if (node.LedgerEntryType === "RippleState") {
       
        var balance, previous, change;
        var currency, issuer, highParty, lowParty, highLimit, lowLimit;
  
        if ( node.NewFields ) {
  
          // trustline created with non-negative balance
  
          if ( parseFloat( node.NewFields.Balance.value ) === 0 ) {
            return;
          }
  
          currency  = node.NewFields.Balance.currency;
          highParty = node.NewFields.HighLimit.issuer;
          highLimit = parseFloat(node.NewFields.HighLimit.value);
          lowParty  = node.NewFields.LowLimit.issuer;
          lowLimit  = parseFloat(node.NewFields.LowLimit.value);
          previous  = 0;
          balance   = parseFloat(node.NewFields.Balance.value);
          change    = balance - previous;
  
        } else if (node.PreviousFields && node.PreviousFields.Balance) {
  
          // trustline balance modified
  
          currency  = node.FinalFields.Balance.currency;
          highParty = node.FinalFields.HighLimit.issuer;
          highLimit = parseFloat(node.FinalFields.HighLimit.value);
          lowParty  = node.FinalFields.LowLimit.issuer;
          lowLimit  = parseFloat(node.FinalFields.LowLimit.value);
          previous  = parseFloat(node.PreviousFields.Balance.value);
          balance   = parseFloat(node.FinalFields.Balance.value);
          change    = balance - previous;
  
        } else {
          return;
        }
  
        emit([currency+"."+lowParty].concat(timestamp),  [highParty, balance, change, unix, tx.hash]);
        emit([currency+"."+highParty].concat(timestamp), [lowParty, (0 - balance), ( 0 - change ), unix, tx.hash]);            
      } 
    });
  });
}