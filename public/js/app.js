'use strict';


// Declare app level module which depends on filters, and services
angular.module('myApp', ['myApp.filters', 'myApp.services', 'myApp.directives'])
  .config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $routeProvider.when('/dashboard', {templateUrl: 'partials/dashboard', controller: DashboardCtrl});
    $routeProvider.when('/network', {templateUrl: 'partials/network'});
    $routeProvider.when('/market/:first/:second', {templateUrl: 'partials/market',
                                                   controller: MarketCtrl});
    $routeProvider.otherwise({redirectTo: '/dashboard'});
    $locationProvider.html5Mode(true);
  }]);
