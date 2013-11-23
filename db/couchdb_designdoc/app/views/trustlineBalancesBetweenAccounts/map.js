function( doc ) {

  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== "tesSUCCESS" )
      return;

    tx.metaData.AffectedNodes.forEach( function( affNode ) {

      var node = affNode.CreatedNode || affNode.ModifiedNode;

      if ( !node || node.LedgerEntryType !== "RippleState" ) {
        return;
      }

      var currency,
        highParty,
        lowParty,
        prevBal,
        finalBal,
        balChange;

      if ( node.NewFields ) {

        // trustline created with non-negative balance

        if ( parseFloat( node.NewFields.Balance.value ) === 0 ) {
          return;
        }

        currency = node.NewFields.Balance.currency;
        highParty = node.NewFields.HighLimit.issuer;
        lowParty = node.NewFields.LowLimit.issuer;

        prevBal = 0;
        finalBal = parseFloat( node.NewFields.Balance.value );
        balChange = finalBal - prevBal;

      } else if ( node.PreviousFields && node.PreviousFields.Balance ) {

        // trustline balance modified

        currency = node.FinalFields.Balance.currency;
        lowParty = node.FinalFields.LowLimit.issuer;
        highParty = node.FinalFields.HighLimit.issuer;

        prevBal = parseFloat( node.PreviousFields.Balance.value );
        finalBal = parseFloat( node.FinalFields.Balance.value );
        balChange = finalBal - prevBal;

      } else {

        return;
      }

      emit( [ lowParty, currency, highParty ].concat( timestamp ), [ balChange, finalBal ] );
      emit( [ highParty, currency, lowParty ].concat( timestamp ), [ ( 0 - balChange ), ( 0 - finalBal ) ] );

    } );
  } );
}