function(keys, values, rereduce) {
  var sum = 0, count = 0;
  values.forEach(function(val, index){
    var to_add = parseFloat(val[0]);
    if (typeof to_add === 'number') {
      sum += to_add;
    }
    
    if (rereduce) count += val[1];
    else count++;
  });
  return [sum, count];
}