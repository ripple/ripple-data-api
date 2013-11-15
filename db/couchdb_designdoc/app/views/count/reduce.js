function(keys, values, rereduce) {
  var counts = {};
  if (rereduce) for (var i = 0, n = values.length; i < n; ++i) {
    var value = values[i];
    for (var key in value) {
      if (counts.hasOwnProperty(key)) counts[key] += value[key];
      else counts[key] = value[key];
    }
  } else for (var i = 0, n = values.length; i < n; ++i) {
    var key = values[i];
    if (counts.hasOwnProperty(key)) ++counts[key];
    else counts[key] = 1;
  }
  return counts;
}
