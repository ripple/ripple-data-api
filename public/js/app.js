'use strict';


// Declare app level module which depends on filters, and services
var app = angular.module('myApp', ['myApp.filters', 'myApp.services', 'myApp.directives'])
  .config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $routeProvider.when('/', {templateUrl: 'partials/dashboard.html', controller: DashboardCtrl});
    $routeProvider.when('/network', {templateUrl: 'partials/network.html'});
    $routeProvider.when('/markets', {templateUrl: 'partials/markets.html'});
    $routeProvider.when('/grid', {templateUrl: 'partials/grid.html'});
    $routeProvider.when('/market/:first/:second', {templateUrl: 'partials/market.html',
                                                   controller: MarketCtrl});
    //Intraday
    $routeProvider.when('/intraday/:first/:second', {templateUrl: 'partials/intraday.html',
                                                   controller: IntradayCtrl});
    //Caps
    $routeProvider.when('/caps/:first', {templateUrl: 'partials/caps.html',
                                         controller: CapsCtrl});
    //News
    $routeProvider.when('/news/:first', {templateUrl: 'partials/news.html',
                                         controller: NewsCtrl});
    //Orderbooks
    $routeProvider.when('/orderbook/:first/:second', {templateUrl: 'partials/orderbook.html',
                                                   controller: OrderbookCtrl});

    //Transaction Feed
    $routeProvider.when('/feed', {templateUrl: 'partials/transaction.html'});

    //Transaction
    $routeProvider.when('/transactions', {templateUrl: 'partials/transactions.html',
                                          controller: NumTransactionsCtrl});

    //Weighted Average
    $routeProvider.when('/market/:first/:second/average', {templateUrl: 'partials/average.html',
                                                   controller: AverageCtrl});

    //Cross-currency transaction, Trading transaction, Paytrade transaction Control
    $routeProvider.when('/transactions/:metric', {templateUrl: 'partials/transactions.html',
                                          controller: NumTransMetricCtrl});

    //Total XRP Control
    $routeProvider.when('/volume/xrp', {templateUrl: 'partials/xrp.html',
                                          controller: TotalXRPCtrl});

    //Number of Accounts Control
    $routeProvider.when('/accounts', {templateUrl: 'partials/accounts.html',
                                          controller: AccountsCtrl});

    $routeProvider.otherwise({redirectTo: '/'});
    $locationProvider.html5Mode(true);
  }]);

//Add this to have access to a global variable
app.run(function($rootScope) {
  $rootScope.title = 'RippleCharts.com';
});

// UserVoice
(function(){var uv=document.createElement('script');uv.type='text/javascript';uv.async=true;uv.src='//widget.uservoice.com/BZAhKCSSiDVOI9b4eNA.js';var s=document.getElementsByTagName('script')[0];s.parentNode.insertBefore(uv,s);})();
