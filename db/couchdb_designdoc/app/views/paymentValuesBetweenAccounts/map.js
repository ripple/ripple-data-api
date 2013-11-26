function( doc ) {

  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach( function( tx ) {

    if ( tx.metaData.TransactionResult !== 'tesSUCCESS' || tx.TransactionType !== 'Payment' )
      return;

    var srcAccount = tx.Account,
      dstAccount = tx.Destination,
      dstCurrency,
      dstAmount;

    if ( typeof tx.Amount === 'object' ) {
      dstCurrency = [ tx.Amount.currency, tx.Amount.issuer ];
      dstAmount = parseFloat( tx.Amount.value );
    } else {
      dstCurrency = [ 'XRP' ];
      dstAmount = parseFloat( tx.Amount );
    }

    emit( [ srcAccount, dstCurrency, dstAccount ].concat( timestamp ), dstAmount );

  } );

}