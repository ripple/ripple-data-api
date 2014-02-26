function( keys, values, rereduce ) {

  var results;

  if ( !rereduce ) {

    results = {
      balanceChange: 0,
      latestTime: keys[ 0 ][ 0 ].slice( 3 ),
      latestBalance: values[ 0 ][ 1 ]
    };

    values.forEach( function( val, index ) {

      var time = keys[ index ][ 0 ].slice( 3 );

      if ( lessThan( results.latestTime, time ) ) {

        results.latestTime = time;
        results.latestBalance = val[ 1 ];

      }

      results.balanceChange += val[ 0 ];

    } );

  } else {

    results = values[0];

    values.forEach( function( val, index ) {

      // skip values[0]
      if (index === 0) {
        return;
      }

      if ( lessThan( results.latestTime, val.latestTime ) ) {

        results.latestTime = val.latestTime;
        results.latestBalance = val.latestBalance;

      }

      results.balanceChange += val.balanceChange;

    } );

  }

  return results;


  



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