'use strict';

/* Services */
var module = angular.module('myApp.services', []);

module.factory('socket', function ($rootScope) {
  var socket;

  if ("object" === typeof io) {
    socket = io.connect();
  } else if ("function" === typeof Pusher) {
    var pusher = new Pusher('37f7316c0995aaf4e147');
    socket = pusher.subscribe('default');
    Pusher.log = function(message) {
      if (window.console && window.console.log) {
        window.console.log(message);
      }
    };
  } else {
    throw new Error("No socket implementation loaded.");
  }

  var model = {};

  function on(name, callback) {
    if ("object" === typeof io) {
      socket.on(name, callback);
    } else if ("function" === typeof Pusher) {
      socket.bind(name, callback);
    } else {
      throw new Error("Socket implementation disappeared at runtime.");
    }
  }

  return {
    bindChannel: function ($scope, model, channelName) {
      on('apply', function (data) {
        $scope.$apply(function () {
          angular.extend(model, data);
        });
      });

      on('set', function (data) {
        $scope.$apply(function () {
          var path = data[0], value = data[1];

          path = path.split('.');

          var segment, select = $scope;
          while ((segment = path.shift())) {
            if (path.length && select[segment]) {
              select = select[segment];
            } else if (path.length) {
              select = select[segment] = {};
            } else {
              select[segment] = value;
            }
          }
        });
      });

      on('queue', function (data) {
        $scope.$apply(function () {
          var name = data[0], value = data[1], maxEntries = data[2];
          if (!Array.isArray(model[name])) {
            model[name] = [];
          }

          var queue = model[name];

          queue.unshift(value);

          if (queue.length > maxEntries) {
            model[name] = queue.slice(0, maxEntries);
          }
        });
      });
    }
  };
});


module.factory('ChartConfig', function(){
  var root = {};
  root.getChartConfig = function(data, title, yAxisTitle, seriesName, rangeSelector, index){
    var dataLength = data.length,
      trans_data = [];

    for (var i = 0; i < data.length; i++)
    {
       trans_data.push([data[i][0], data[i][index]]);
    }
    return {
      chart: {
        type: 'line',
        zoomType: 'x'
      },

      title: {
        text: title
      },

      rangeSelector: rangeSelector,

      xAxis: {
        type: 'datetime',
        labels: {
          formatter : function() {
            return Highcharts.dateFormat('%a, %b %d', this.value)
          }
        }
      },

      yAxis: {
        title: {
          text: yAxisTitle
        },
        plotLines: [{
          value: 0,
          width: 1,
          color: '#808080'
        }]
      },

      tooltip: {
        borderColor: "#2F7ED8"
      },

      series: [{
        name: seriesName,
        data: trans_data
      }]
    };
  };
  return root;
});

