'use strict';

/* Directives */
var module = angular.module('myApp.directives', []);

module.directive('appVersion', ['version', function(version) {
  return function(scope, elm, attrs) {
    elm.text(version);
  };
}]);

module.directive('stockchart', function () {
  return {
    restrict: 'E',
    template: '<div></div>',
    replace: true,
    scope: { data: "=value" },

    link: function (scope, element, attrs) {
      var chartsDefaults = {
        chart: {
          renderTo: element[0],
          type: attrs.type || null,
          height: attrs.height || null,
          width: attrs.width || null
        }
      };

      //Update when charts data changes
      scope.$watch("data", function(value) {
        if (!value) return;
        // We need deep copy in order to NOT override original chart object.
        // This allows us to override chart data member and still the keep
        // our original renderTo will be the same
        var deepCopy = true;
        var newSettings = {};
        $.extend(deepCopy, newSettings, chartsDefaults, value);
        var chart = new Highcharts.StockChart(newSettings);
      }, true);
    }
  };
});

module.directive('highchart', function () {
  return {
    restrict: 'E',
    template: '<div></div>',
    replace: true,
    scope: { data: "=value" },

    link: function (scope, element, attrs) {
      var chartsDefaults = {
        chart: {
          renderTo: element[0],
          type: attrs.type || null,
          height: attrs.height || null,
          width: attrs.width || null
        }
      };

      //Update when charts data changes
      scope.$watch("data", function(value) {
        if (!value) return;
        // We need deep copy in order to NOT override original chart object.
        // This allows us to override chart data member and still the keep
        // our original renderTo will be the same
        var deepCopy = true;
        var newSettings = {};
        $.extend(deepCopy, newSettings, chartsDefaults, value);
        var chart = new Highcharts.Chart(newSettings);
      }, true);
    }
  };
});

module.directive('rpchRowlink', function () {
  return {
    restrict: 'A',

    compile: function (element, attrs) {
      console.log(element);
      return {
        post: function () {
          $(element).rowlink();
        }
      };
    }
  };
});
