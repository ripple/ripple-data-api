'use strict';

/* Filters */
var module = angular.module('myApp.filters', []);

module.filter('interpolate', ['version', function(version) {
  return function(text) {
    return String(text).replace(/\%VERSION\%/mg, version);
  };
}]);


module.filter('rpdate', [function() {
  return function(text) {
    return text && moment(+text*1000).format('MMMM Do YYYY, h:mm:ss a');
  };
}]);
