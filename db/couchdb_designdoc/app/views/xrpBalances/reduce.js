function( keys, values, rereduce ) {

  var most_recent = ( rereduce ? values[ 0 ][ 0 ].slice( 1 ) : keys[ 0 ].slice( 1 ) ),
    acct_balance = ( rereduce ? values[ 0 ][ 0 ] : values[ 0 ] );

  for ( var a = 0, num_keys = keys.length; a < num_keys; a++ ) {
    var timestamp = ( rereduce ? keys[ a ][ 0 ].slice( 1 ) : keys[ a ].slice( 1 ) );

    if ( lessThan( most_recent, timestamp ) ) {
      most_recent = timestamp;
      acct_balance = ( rereduce ? values[ a ][ 0 ] : values[ a ] );
    }
  }

  return [ acct_balance ].concat( most_recent );

  function lessThan( arr1, arr2 ) {
    if ( arr1.length !== arr2.length )
      return false;

    for ( var i = 0; i < arr1.length; i++ ) {
      if ( arr1[ i ] < arr2[ i ] ) {
        return true;
      } else if ( arr1[ i ] > arr2[ i ] ) {
        return false;
      } else {
        continue;
      }
    }

    return false;
  }
}