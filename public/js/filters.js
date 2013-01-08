'use strict';

/* Filters */
var module = angular.module('myApp.filters', []);

module.filter('interpolate', ['version', function(version) {
  return function(text) {
    return String(text).replace(/\%VERSION\%/mg, version);
  };
}]);
