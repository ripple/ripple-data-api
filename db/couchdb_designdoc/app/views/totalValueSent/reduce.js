function(keys, values) {
  var sum = 0;
  values.forEach(function(val, index){
    var to_add;
    if (typeof val === 'number') {
      to_add = val;
    } else if (typeof val === 'string') {
      to_add = parseFloat(val);

      if (typeof to_add !== 'number') {
        log('bad value: ' + val);
        return;
      }
    } else {
      log('bad value: ' + val);
      return;
    }

    sum += to_add;
  });
  return sum;
}