var extend = require('extend');

var model = exports;

model.broadcast = function () {};
model.data = {};

model.apply = function (obj) {
  // TODO: Should check if anything actually changed
  extend(model.data, obj);
  model.broadcast('apply', obj);
}

