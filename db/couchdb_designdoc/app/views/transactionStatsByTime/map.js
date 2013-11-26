function( doc ) {

  var time = new Date( doc.close_time_timestamp ),
    timestamp = [ time.getUTCFullYear( ), time.getUTCMonth( ), time.getUTCDate( ),
      time.getUTCHours( ), time.getUTCMinutes( ), time.getUTCSeconds( )
    ];

  doc.transactions.forEach( function( tx ) {

    if ( doc.transactions[ t ].metaData.TransactionResult !== "tesSUCCESS" ) {
      return;
    }

    var value = {};
    value[ tx.TransactionType ] = 1;

    emit( timestamp, value );

  } );
}