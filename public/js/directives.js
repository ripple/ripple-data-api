'use strict';

/* Directives */
var module = angular.module('myApp.directives', []);

module.directive('appVersion', ['version', function(version) {
  return function(scope, elm, attrs) {
    elm.text(version);
  };
}]);
