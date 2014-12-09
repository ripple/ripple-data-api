function (doc) {

  var time    = new Date(doc.close_time_timestamp);
  var unix    = Math.round(time.getTime());
    timestamp = [
      time.getUTCFullYear(), 
      time.getUTCMonth(), 
      time.getUTCDate(),
      time.getUTCHours(), 
      time.getUTCMinutes(), 
      time.getUTCSeconds()
    ];
  
  var hash;
  var nodes;
  var i;
  var j;
  
  var node;
  var fields;
  var balance;
  var previous;
  var change;
  
  var currency;
  var issuer; 
  var highParty; 
  var lowParty; 
  var highLimit; 
  var lowLimit;
  
  for(i=0; i<doc.transactions.length; i++) {

    if (doc.transactions[i].metaData.TransactionResult !== "tesSUCCESS" ) {
      return;
    }
    
    hash  = doc.transactions[i].hash;
    nodes = doc.transactions[i].metaData.AffectedNodes;

    for(j=0; j<nodes.length; j++) {
      node = nodes[j].ModifiedNode || nodes[j].CreatedNode || nodes[j].DeletedNode;
    
      if (!node) return;
      if (node.LedgerEntryType === "AccountRoot" ) {
      
        fields = node.FinalFields || node.NewFields;
          
        if (fields) {
          balance  = fields.Balance,
          previous = node.PreviousFields ? node.PreviousFields.Balance : 0,
          change   = (balance - previous) / 1000000.0;
          balance  = balance / 1000000.0; //convert to XRP
         
          emit(["XRP"].concat(timestamp), [fields.Account, balance, change, unix, hash]);
        } 
      
      } else if (node.LedgerEntryType === "RippleState") {
       
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
  
        emit([currency+"."+lowParty].concat(timestamp),  [highParty, balance, change, unix, hash]);
        emit([currency+"."+highParty].concat(timestamp), [lowParty, (0 - balance), ( 0 - change ), unix, hash]);            
      } 
    }
  }
}