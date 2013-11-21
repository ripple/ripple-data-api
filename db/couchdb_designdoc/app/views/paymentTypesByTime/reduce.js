function( keys, values, rereduce ) {

  var stats = {};

  values.forEach( function( val ) {

    Object.keys( val ).forEach( function( txType ) {
      if ( !stats[ txType ] ) {
        stats[ txType ] = 0;
      }

      stats[ txType ] += val[ txType ];
      
    } );
  } );

  return stats;

}