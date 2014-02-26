function(keys, values) {
  var sum = 0;
  values.forEach(function(val, index){
    var to_add = parseFloat(val);
    if (typeof to_add === 'number') {
      sum += to_add;
    }
  });
  return sum;
}