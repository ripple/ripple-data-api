'use strict';


// Declare app level module which depends on filters, and services
angular.module('myApp', ['myApp.filters', 'myApp.services', 'myApp.directives'])
  .config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $routeProvider.when('/', {templateUrl: 'partials/dashboard', controller: DashboardCtrl});
    $routeProvider.when('/network', {templateUrl: 'partials/network'});
    $routeProvider.when('/market/:first/:second', {templateUrl: 'partials/market',
                                                   controller: MarketCtrl});
    $routeProvider.otherwise({redirectTo: '/'});
    $locationProvider.html5Mode(true);
  }]);

// UserVoice
(function(){var uv=document.createElement('script');uv.type='text/javascript';uv.async=true;uv.src='//widget.uservoice.com/BZAhKCSSiDVOI9b4eNA.js';var s=document.getElementsByTagName('script')[0];s.parentNode.insertBefore(uv,s);})();
