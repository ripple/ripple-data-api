function( doc ) {

  var time    = new Date( doc.close_time_timestamp ),
    unix      = Math.round(time.getTime()),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== 'tesSUCCESS' ) {
      return;
    }

    if ( tx.TransactionType !== 'OfferCreate' && tx.TransactionType !== 'OfferCancel' ) {
      return;
    }
    
    //emit(timestamp, [tx.TransactionType, tx.Account, tx.hash]);

    tx.metaData.AffectedNodes.forEach( function( affNode ) {

      var node = affNode.CreatedNode || affNode.DeletedNode;

      if ( !node || node.LedgerEntryType !== 'Offer' ) {
        return;
      }

      
      var fields = node.NewFields || node.FinalFields;
      
      if (!fields) return;

      var exchangeRate = node.exchange_rate,
        payCurr,
        payAmnt,
        getCurr,
        getAmnt;
        
      if ( typeof fields.TakerGets === "object" ) {
        getCurr = fields.TakerGets.currency+"."+fields.TakerGets.issuer;
        getAmnt = parseFloat(fields.TakerGets.value, 10);
      } else {
        getCurr = "XRP";
        getAmnt = fields.TakerGets / 1000000.0;
        exchangeRate = exchangeRate * 1000000.0;
      }
        
      if ( typeof fields.TakerPays === "object" ) {
        payCurr = fields.TakerPays.currency+"."+fields.TakerPays.issuer;
        payAmnt = parseFloat(fields.TakerPays.value, 10);
      } else {
        payCurr = "XRP";
        payAmnt = fields.TakerPays / 1000000.0;
        exchangeRate = exchangeRate / 1000000.0;
      }
      
      emit( [ payCurr+":"+getCurr ].concat( timestamp ), [ tx.TransactionType, tx.Account, payAmnt, getAmnt, exchangeRate,     unix, tx.hash] );
      emit( [ getCurr+":"+payCurr ].concat( timestamp ), [ tx.TransactionType, tx.Account, getAmnt, payAmnt, 1 / exchangeRate, unix, tx.hash] );

    } );
  } );
}