'use strict';

/* Controllers */

function AppCtrl($scope, socket) {
  // Easier access for debugging
  window.$scope = $scope;

  socket.on('apply', function (data) {
    angular.extend($scope, data);
  });
}

function DashboardCtrl() {}
DashboardCtrl.$inject = [];

function MarketCtrl($scope, $http, $routeParams)
{
  angular.extend($scope, $routeParams);
  var symbol = $scope.symbol = $scope.first + "/" + $scope.second;

  $http.get('api/market/'+symbol+'/daily.json').success(function (data) {
    // Split the data set into ohlc and volume
    var ohlc = [],
        volume = [],
        dataLength = data.length;

    for (var i = 0; i < dataLength; i++) {
      ohlc.push([
        data[i][0], // the date
        data[i][1], // open
        data[i][2], // high
        data[i][3], // low
        data[i][4] // close
      ]);

      volume.push([
        data[i][0], // the date
        data[i][5] // the volume
      ]);
    }

    // set the allowed units for data grouping
    var groupingUnits = [[
      'week',                         // unit name
      [1]                             // allowed multiples
    ], [
      'month',
      [1, 2, 3, 4, 6]
    ]];

    $scope.data = {
      chart: {
        alignTicks: false
      },

      rangeSelector: {
        selected: 1
      },

      title: {
        text: symbol
      },

      yAxis: [{
        title: {
          text: 'OHLC'
        },
        height: 200,
        lineWidth: 2
      }, {
        title: {
          text: 'Volume'
        },
        top: 300,
        height: 100,
        offset: 0,
        lineWidth: 2
      }],

      series: [{
        type: 'candlestick',
        name: symbol,
        data: ohlc,
        dataGrouping: {
          units: groupingUnits
        }
      }, {
        type: 'column',
        name: 'Volume',
        data: volume,
        yAxis: 1,
        dataGrouping: {
          units: groupingUnits
        }
      }]
    };
  });
}
