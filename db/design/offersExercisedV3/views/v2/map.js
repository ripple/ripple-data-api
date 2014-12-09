function(doc) {
  var time      = new Date(doc.close_time_timestamp);
  var unix      = Math.round(time.getTime());
  var timestamp = [ time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(),
    time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()
  ];
  
  var account;
  var hash;
  var nodes;
  var node;
  var i;
  var j;

  var exchangeRate;
  var counterparty;
  var payCurr;
  var payAmnt;
  var getCurr;
  var getAmnt;


  for(i=0; i<doc.transactions.length; i++) {

    if (doc.transactions[i].metaData.TransactionResult !== 'tesSUCCESS') {
      return;
    }

    if (doc.transactions[i].TransactionType !== 'Payment' && 
        doc.transactions[i].TransactionType !== 'OfferCreate') {
      return;
    }

    hash    = doc.transactions[i].hash;
    account = doc.transactions[i].Account;
    nodes   = doc.transactions[i].metaData.AffectedNodes;
    
    for(j=0; j<nodes.length; j++) {

      node = nodes[j].ModifiedNode || nodes[j].DeletedNode;

      if (!node || node.LedgerEntryType !== 'Offer') {
        return;
      }

      if (!node.PreviousFields || !node.PreviousFields.TakerPays || !node.PreviousFields.TakerGets) {
        return;
      }
  
      exchangeRate = node.exchange_rate;
      counterparty = node.FinalFields.Account;

      if ( typeof node.PreviousFields.TakerPays === "object" ) {
        payCurr = node.PreviousFields.TakerPays.currency+"."+node.PreviousFields.TakerPays.issuer;
        payAmnt = node.PreviousFields.TakerPays.value - node.FinalFields.TakerPays.value;
        
      } else {
        payCurr = "XRP";
        payAmnt = (node.PreviousFields.TakerPays - node.FinalFields.TakerPays) / 1000000.0; // convert from drops
        exchangeRate = exchangeRate / 1000000.0;
      }

      if ( typeof node.PreviousFields.TakerGets === "object" ) {
        getCurr = node.PreviousFields.TakerGets.currency+"."+node.PreviousFields.TakerGets.issuer;
        getAmnt = node.PreviousFields.TakerGets.value - node.FinalFields.TakerGets.value;
      } else {
        getCurr = "XRP";
        getAmnt = (node.PreviousFields.TakerGets - node.FinalFields.TakerGets) / 1000000.0;
        exchangeRate = exchangeRate * 1000000.0;
      }
      
      if (payCurr < getCurr) {
        emit([payCurr+":"+getCurr].concat(timestamp), [payAmnt, getAmnt, exchangeRate, counterparty, account, unix, hash]);
      } else {
        emit([getCurr+":"+payCurr].concat(timestamp), [getAmnt, payAmnt, 1 / exchangeRate, account, counterparty, unix, hash]);
      } 
    }
  }
}