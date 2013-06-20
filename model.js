var extend = require('extend');
var _ = require('lodash');
var winston = require('winston');

var model = exports;

model.broadcast = function () {};
model.data = {};

model.apply = function (obj) {
  // TODO: Should check if anything actually changed
  extend(model.data, obj);
  model.broadcast('apply', obj);
}

model.set = function (path_str, value) {
  var path = path_str.split('.');

  var segment, select = model.data;
  while ((segment = path.shift())) {
    if (path.length && select[segment]) {
      select = select[segment];
    } else if (path.length) {
      select = select[segment] = {};
    } else {
      if (_.isEqual(select[segment], value)) return;
      select[segment] = value;
    }
  }

  winston.info("SET", path_str, value);
  model.broadcast('set', [path_str, value]);
}
