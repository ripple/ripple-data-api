function( keys, values, rereduce ) {

  var stats;

  if ( !rereduce ) {

    var firstTime = keys[ 0 ][ 0 ].slice( 2 ),
      firstPrice;

    if ( values[ 0 ][ 2 ] ) { // exchangeRate
      firstPrice = parseFloat(values[ 0 ][ 2 ]);
    } else {
      firstPrice = values[ 0 ][ 0 ] / values[ 0 ][ 1 ];
    }

    // initial values
    stats = {
      openTime: firstTime,
      closeTime: firstTime,

      open: firstPrice,
      close: firstPrice,
      high: firstPrice,
      low: firstPrice,

      curr1VwavNumerator: 0,
      curr1Volume: 0,
      curr2Volume: 0,
      numTrades: 0
    };

    values.forEach( function( trade, index ) {

      var tradeTime = keys[ index ][ 0 ].slice( 2 ),
        tradeRate = trade[ 2 ] || ( trade[ 0 ] / trade[ 1 ] );

      if ( lessThan( tradeTime, stats.openTime ) ) {
        stats.openTime = tradeTime;
        stats.open = tradeRate;
      }

      if ( lessThan( stats.closeTime, tradeTime ) ) {
        stats.closeTime = tradeTime;
        stats.close = tradeRate;
      }

      stats.high = Math.max( stats.high, tradeRate );
      stats.low = Math.min( stats.low, tradeRate );
      stats.curr1VwavNumerator += tradeRate * trade[ 0 ];
      stats.curr1Volume += trade[ 0 ];
      stats.curr2Volume += trade[ 1 ];
      stats.numTrades++;

    } );

    stats.volumeWeightedAvg = stats.curr1VwavNumerator / stats.curr1Volume;

    return stats;

  } else {

    stats = values[0];

    values.forEach( function( segment, index ) {

      // skip values[0]
      if (index === 0) {
        return;
      }

      if ( lessThan( segment.openTime, stats.openTime ) ) {
        stats.openTime = segment.openTime;
        stats.open = segment.open;
      }
      if ( lessThan( stats.closeTime, segment.closeTime ) ) {
        stats.closeTime = segment.closeTime;
        stats.close = segment.close;
      }

      stats.high = Math.max( stats.high, segment.high );
      stats.low = Math.min( stats.low, segment.low );

      stats.curr1VwavNumerator += segment.curr1VwavNumerator;
      stats.curr1Volume += segment.curr1Volume;
      stats.curr2Volume += segment.curr2Volume;
      stats.numTrades += segment.numTrades;

    } );

    stats.volumeWeightedAvg = stats.curr1VwavNumerator / stats.curr1Volume;

    return stats;
  }


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