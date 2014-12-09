function( keys, values, rereduce ) {

  var stats;
  var segment;
  var i;
  
  if ( !rereduce ) {

    var time  = values[0][5]; //unix timestamp
    var price = values[0][2]; //exchange rate

    // initial values
    stats = {
      openTime  : time,
      closeTime : time,

      open  : price,
      close : price,
      high  : price,
      low   : price,

      curr1Volume : 0,
      curr2Volume : 0,
      numTrades   : 0
    };

    for (i=0; i<values.length; i++) {
      
      time  = values[i][5]; //unix timestamp
      price = values[i][2]; //exchange rate

      if (time < stats.openTime) {
        stats.openTime = time;
        stats.open     = price;
      }

      if (stats.closeTime < time) {
        stats.closeTime = time;
        stats.close     = price;
      }

      if (price > stats.high) stats.high = price;
      if (price < stats.low)  stats.low  = price;
      
      stats.curr1Volume += values[i][0];
      stats.curr2Volume += values[i][1];
      stats.numTrades++;
    }

    return stats;

  } else {
    
    stats = values[0];

    //skip the first
    for (i=1; i<values.length; i++) {
      segment = values[i];
      
      if (segment.openTime < stats.openTime) {
        stats.openTime = segment.openTime;
        stats.open     = segment.open;
      }
      
      if (stats.closeTime < segment.closeTime) {
        stats.closeTime = segment.closeTime;
        stats.close     = segment.close;
      }

      if (segment.high > stats.high) stats.high = segment.high;
      if (segment.low < stats.low)   stats.low  = segment.low;

      stats.curr1Volume += segment.curr1Volume;
      stats.curr2Volume += segment.curr2Volume;
      stats.numTrades   += segment.numTrades;
    } 

    return stats;
  }
}