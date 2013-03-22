var extend = require('extend');

var model = exports;

model.broadcast = function () {};
model.data = {};

model.apply = function (obj) {
  // TODO: Should check if anything actually changed
  extend(model.data, obj);
  model.broadcast('apply', obj);
}

model.set = function (path_str, value) {
  console.log("SET", path_str, value);
  var path = path_str.split('.');

  var segment, select = model.data;
  while ((segment = path.shift())) {
    if (path.length && select[segment]) {
      select = select[segment];
    } else if (path.length) {
      select = select[segment] = {};
    } else {
      select[segment] = value;
    }
  }

  model.broadcast('set', [path_str, value]);
}
