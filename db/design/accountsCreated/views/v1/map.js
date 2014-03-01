function( doc ) {

  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== "tesSUCCESS" ) {
      return;
    }

      tx.metaData.AffectedNodes.forEach( function( affNode ) {

        if ( affNode.CreatedNode && affNode.CreatedNode.LedgerEntryType === "AccountRoot" ) {

          emit( timestamp, affNode.CreatedNode.NewFields.Account );
          
        }

      } );
  } );
}