function( keys, values, rereduce ) {

  var stats = {};

  if ( rereduce ) {
    values.forEach( function(d) {
      for (var key in d) {
        if (stats[key]) stats[key] += d[key];
        else stats[key] = d[key];       
      }
    });
    
  } else {
  
    values.forEach( function(tx) {
      if (stats[tx[0]]) stats[tx[0]]++;
      else stats[tx[0]] = 1;
    });
  }
  
 
  return stats;
}