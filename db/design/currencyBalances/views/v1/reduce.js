function( keys, values, rereduce ) {

  var sum = 0;

  if ( rereduce ) {
    values.forEach( function(d) {
      sum += d;
    });
    
  } else {
  
    values.forEach( function(d) {
      sum += d[2]; //balance change
    });
  }
  
  return sum;
}