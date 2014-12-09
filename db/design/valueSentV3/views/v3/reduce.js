function(keys, values, rereduce) {
  var sum   = 0
  var count = 0;
  var i;
  
  for (i=0; i<values.length; i++) {
    sum += val[0];
    
    if (rereduce) count += val[1];
    else count++;
  }
  
  return [sum, count];
}