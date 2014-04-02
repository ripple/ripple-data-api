function( keys, values, rereduce ) {

  var stats = [0,0];

  if ( rereduce ) {
    values.forEach( function(d) {
      stats[0] += d[0];
      stats[1] += d[1];
    });
    
  } else {
  
    values.forEach( function(tx) {
      if      (tx[0]=='OfferCreate') stats[0]++;
      else if (tx[0]=='OfferCancel') stats[1]++;
    });
  }
  
 
  return stats;
}