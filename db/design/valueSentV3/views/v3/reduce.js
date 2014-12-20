function(keys, values, rereduce) {
  var sum   = 0
  var count = 0;
  var i;
  
  for (i=0; i<values.length; i++) {
    sum += values[i][0];
    
    if (rereduce) count += values[i][1];
    else count++;
  }
  
  return [sum, count];
}