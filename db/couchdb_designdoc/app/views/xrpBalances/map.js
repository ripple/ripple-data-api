function( doc ) {
  var transactions = doc.transactions;

  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];


  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== "tesSUCCESS" ) {
      return;
    }

    tx.metaData.AffectedNodes.forEach( function( affNode ) {
      var node = affNode.ModifiedNode || affNode.CreatedNode || affNode.DeletedNode;

      if ( !node || node.LedgerEntryType !== "AccountRoot" ) {
        return;
      }

      var fields = node.FinalFields || node.NewFields;

      if ( fields ) {
        emit( [ fields.Account ].concat( timestamp ), parseInt( fields.Balance, 10 ) );
      }
    } );
  } );
}