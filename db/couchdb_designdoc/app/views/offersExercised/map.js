function( doc ) {

  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== 'tesSUCCESS' ) {
      return;
    }

    if ( tx.TransactionType !== 'Payment' && tx.TransactionType !== 'OfferCreate' ) {
      return;
    }

    tx.metaData.AffectedNodes.forEach( function( affNode ) {

      var node = affNode.ModifiedNode || affNode.DeletedNode;

      if ( !node || node.LedgerEntryType !== 'Offer' ) {
        return;
      }

      if ( !node.PreviousFields || !node.PreviousFields.TakerPays || !node.PreviousFields.TakerGets ) {
        return;
      }

      var exchangeRate = node.exchange_rate,
        payCurr,
        payAmnt,
        getCurr,
        getAmnt;

      if ( typeof node.PreviousFields.TakerPays === "object" ) {
        payCurr = [ node.PreviousFields.TakerPays.currency, node.PreviousFields.TakerPays.issuer ];
        payAmnt = node.PreviousFields.TakerPays.value - node.FinalFields.TakerPays.value;
      } else {
        payCurr = [ "XRP" ];
        payAmnt = ( node.PreviousFields.TakerPays - node.FinalFields.TakerPays ) / 1000000.0; // convert from drops
        exchangeRate = exchangeRate / 1000000.0;
      }

      if ( typeof node.PreviousFields.TakerGets === "object" ) {
        getCurr = [ node.PreviousFields.TakerGets.currency, node.PreviousFields.TakerGets.issuer ];
        getAmnt = node.PreviousFields.TakerGets.value - node.FinalFields.TakerGets.value;
      } else {
        getCurr = [ "XRP" ];
        getAmnt = ( node.PreviousFields.TakerGets - node.FinalFields.TakerGets ) / 1000000.0;
        exchangeRate = exchangeRate * 1000000.0;
      }

      emit( [ payCurr, getCurr ].concat( timestamp ), [ payAmnt, getAmnt, exchangeRate ] );
      emit( [ getCurr, payCurr ].concat( timestamp ), [ getAmnt, payAmnt, 1 / exchangeRate ] );

    } );
  } );
}