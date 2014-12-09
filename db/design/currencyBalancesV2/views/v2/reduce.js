function( keys, values, rereduce ) {

  var sum = 0;
  var i;
  
  if ( rereduce ) {
    for (i=0; i<values.length; i++) {
      sum += values[i];
    }
    
  } else {
    for (i=0; i<values.length; i++) {
      sum += values[i][2]; //balance change
    }
  }
  
  return sum;
}