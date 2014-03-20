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

    //only include payments
    if (tx.TransactionType !== 'Payment') return;
    
    //ignore "convert" payments.  
    if (tx.Account==tx.Destination) return; 
    
    
    //if the Account and Destination are the same, the transaction uses path finding
    //to exchange one currency for another - practically similar to an "OfferCreate".
    //var isConvert  = (tx.TransactionType=='Payment' && tx.Account==tx.Destination) ? true : false;
    var offers   = [], 
      IOUchanges = [],
      XRPchanges = [];
    var type;
      
    //loop through the affected nodes to find values sent and received
    tx.metaData.AffectedNodes.forEach(function(affNode) {

      var node = affNode.CreatedNode || affNode.ModifiedNode || affNode.DeletedNode;
      var change = null, fee = parseFloat(tx.Fee);
      
      //Look for XRP balance changes in AccountRoot nodes
      if (node.LedgerEntryType === 'AccountRoot') {
        change = parseAccountRoot(node, tx.Account, fee);
        
        if (change) {
          //ignore changes that do not involve the sender or the receiver.
          //these are the result of offers exercised for cross currency payments
          //and would require similar handling to "convert" and offer create.
          if (change.account != tx.Account && change.account != tx.Destination) return;  
          if (!type) type = "XRP";
          XRPchanges.push(change);
        }
        
      //Look for IOU balance changes in RippleState nodes
      } else if (node.LedgerEntryType === 'RippleState') {
        change = parseRippleState(node);
        
        if (change) {
          //ignore the ones that do not involve the payment sender or receiver
          if (change.high != tx.Account     && change.low != tx.Account &&
              change.high != tx.Destination && change.low != tx.Destination) {
              return;              
              }
         
          //invert the amount if the sending account is the low party? 
          //not entirely sure why we are doing this here.
          if (tx.Account==change.low) change.value = 0 - change.value;
         
         
          if (tx.Account==change.issuer || tx.Destination==change.issuer) {
            type = "issuer";
            
            //must be received
            if (tx.Destination==change.issuer) 
              IOUchanges.push({
                account      : tx.Destination,
                currency     : change.currency,
                issuer       : change.issuer,
                type         : "received",
                value        : change.value > 0 ? change.value : 0 - change.value,
                counterparty : tx.Account          
              });
            
            //must be sent
            else IOUchanges.push({
              account      : tx.Account,
              currency     : change.currency,
              issuer       : change.issuer,
              type         : 'sent',
              value        : change.value > 0 ? change.value : 0 - change.value,
              counterparty : tx.Destination,          
            });
            
                
          } else { 
            if (type != "issuer") type = "iou";
            if (change.value > 0) IOUchanges.push({
              account      : tx.Account,
              currency     : change.currency,
              issuer       : change.issuer,
              type         : "sent",
              value        : change.value,
              counterparty : tx.Destination           
            });
            
            else IOUchanges.push({
              account      : tx.Destination,
              currency     : change.currency,
              issuer       : change.issuer,
              type         : "received",
              value        : 0 - change.value,
              counterparty : tx.Account,          
            });
          }          
        }
      }
    }); 
    
    //this is a special case where we are sending to an issuer, in the 
    //issuers own currency - in this case there will only be one IOU balance
    //change, therefore we need to recipricate it.  I'm not sure that
    //this covers every situation.
    if (type=="issuer" && !XRPchanges.length && IOUchanges.length==1) {
      var c = IOUchanges[0];
      IOUchanges.push({
        account      : c.counterparty,
        currency     : c.currency,
        issuer       : c.issuer,
        type         : c.type=="sent" ? "received" : "sent",
        value        : c.value,
        counterparty : c.account,  
      });
    }
    
    //handle XRP balance changes. We already excluded
    //any that did not involve the sending or destination
    //account, so the counterparty will whichever is the
    //opposite of the account whose balance changed.          
    XRPchanges.forEach(function(c){
      c.counterparty = c.account == tx.Account ? tx.Destination : tx.Account;
      emit([c.account].concat(timestamp), [c.currency, c.issuer, c.type, c.value, c.counterparty, unix, tx.hash]);
    });
    

    IOUchanges.forEach(function(c){
      emit([c.account].concat(timestamp), [c.currency, c.issuer, c.type, c.value, c.counterparty, unix, tx.hash]);
    });
      
    //if (type=="issuer") {  
    //  XRPchanges.forEach(function(c){log(c)});
    //  IOUchanges.forEach(function(c){log(c)});
    //  log(tx.hash);
    //}   
  });
  
  
  function parseAccountRoot (node, account, fee) {
    var balChange, value;
    
    //if a new account root has been created, this can
    //only be XRP received, and cannot be the sending account
    if (node.NewFields) {
      value = parseFloat(node.NewFields.Balance) / 1000000.0;
      
      return {
        value    : value,
        currency : 'XRP',
        issuer   : '',
        type     : 'received',
        account  : node.NewFields.Account
      };


    //otherwise we should have a previous entry and a final
    //entry, and the balance change is the difference between them.
    //this could be XRP sent or received, and will include the
    //transaction fee if this is the sending account
    } else if (node.FinalFields && node.PreviousFields) {
    
      //subtract previous from final to get the total balance change  
      balChange = node.FinalFields.Balance - node.PreviousFields.Balance;
        
      //if this is the sending account, remove the fee by adding it 
      //back to the balance change.  
      if (account==node.FinalFields.Account) balChange += fee;
      
      //if we still have a balance change, log it.  If it is negative,
      //XRP was sent from the account. Otherwise, it was received
      if (balChange) {
        value = balChange<0 ? (0 - balChange) : balChange; //invert if negative  
        
        return {
          value    : parseFloat(value) / 1000000.0,
          currency : 'XRP',
          issuer   : '',
          type     : balChange<0 ? 'sent' : 'received', //sent if negative, else received
          account  : node.FinalFields.Account
        };
      }  
    }

    return null;
  }  
  
  function parseRippleState (node) {
    
    var change = {
        value        : 0,
        currency     : '',
        issuer       : '',
        type         : '',
      }, 
      trustHigh,
      trustLow,
      trustBalFinal,
      trustBalPrev;

    if (node.NewFields) {
      trustHigh         = node.NewFields.HighLimit;
      trustLow          = node.NewFields.LowLimit;
      trustBalFinal     = parseFloat(node.NewFields.Balance.value);
      
    } else {
      trustHigh         = node.FinalFields.HighLimit;
      trustLow          = node.FinalFields.LowLimit;
      trustBalFinal     = parseFloat(node.FinalFields.Balance.value); 
    }

    if (node.PreviousFields && node.PreviousFields.Balance) {
      trustBalPrev = parseFloat(node.PreviousFields.Balance.value);
    } else {
      trustBalPrev = 0;
    } 
      
    change.value = parseFloat(trustBalFinal) - parseFloat(trustBalPrev); 
    change.high  = trustHigh.issuer;
    change.low   = trustLow.issuer;
    
    //Set currency
    change.currency = (node.NewFields || node.FinalFields).Balance.currency;

    // Set issuer
    // rules:  
    //    if the balance is negative, the low party is the issuer
    //    if the balance is 0, and the balance was previously negative, the low party is the issuer
    //    if the balance is 0, and the balance was previously positive, the high party is the issuer
    //    if the balance is positive, the high party is the issuer
    if (trustBalFinal < 0)                         change.issuer = trustLow.issuer;
    else if (trustBalFinal==0 && trustBalPrev < 0) change.issuer = trustLow.issuer; 
    else                                           change.issuer = trustHigh.issuer;
    
    return change;
  }
}