function( keys, values, rereduce ) {

  var stats;

  if ( !rereduce ) {

    var firstTime = values[0][3], //unix timestamp
      firstPrice  = values[0][2]; //exchange rate

    // initial values
    stats = {
      openTime  : firstTime,
      closeTime : firstTime,

      open  : firstPrice,
      close : firstPrice,
      high  : firstPrice,
      low   : firstPrice,

      curr1VwavNumerator : 0,
      curr1Volume : 0,
      curr2Volume : 0,
      numTrades   : 0
    };

    values.forEach( function( trade, index ) {

      var time = trade[3],
        price  = trade[2];

      if (time<stats.openTime) {
        stats.openTime = time;
        stats.open     = price;
      }

      if (stats.closeTime<time) {
        stats.closeTime = time;
        stats.close     = price;
      }

      if (price>stats.high) stats.high = price;
      if (price<stats.low)  stats.low  = price;
      
      stats.curr1VwavNumerator += price * trade[0]; //pay amount
      stats.curr1Volume += trade[0];
      stats.curr2Volume += trade[1];
      stats.numTrades++;
    });

    stats.volumeWeightedAvg = stats.curr1VwavNumerator / stats.curr1Volume;

    return stats;

  } else {

    stats = values[0];

    values.forEach( function( segment, index ) {

      // skip values[0]
      if (index === 0) return;

      if (segment.openTime<stats.openTime) {
        stats.openTime = segment.openTime;
        stats.open     = segment.open;
      }
      if (stats.closeTime<segment.closeTime) {
        stats.closeTime = segment.closeTime;
        stats.close     = segment.close;
      }

      if (segment.high>stats.high) stats.high = segment.high;
      if (segment.low<stats.low)   stats.low  = segment.low;

      stats.curr1VwavNumerator += segment.curr1VwavNumerator;
      stats.curr1Volume += segment.curr1Volume;
      stats.curr2Volume += segment.curr2Volume;
      stats.numTrades   += segment.numTrades;

    } );

    stats.volumeWeightedAvg = stats.curr1VwavNumerator / stats.curr1Volume;

    return stats;
  }
}