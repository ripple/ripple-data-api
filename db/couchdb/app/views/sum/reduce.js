function(keys, values, rereduce) {
  var counts = {};
  if (rereduce) for (var i = 0, n = values.length; i < n; ++i) {
    var value = values[i];
    for (var key in value) {
      if (counts.hasOwnProperty(key)) counts[key] += value[key];
      else counts[key] = value[key];
    }
  } else for (var i = 0, n = values.length; i < n; ++i) {
    var pair = values[i],
        value = pair[0],
        key = pair[1];
    if (counts.hasOwnProperty(key)) counts[key] += value;
    else counts[key] = value;
  }
  return counts;
}
