'use strict';

/* Services */
var module = angular.module('myApp.services', []);

module.factory('socket', function ($rootScope) {
  var socket = io.connect();
  return {
    on: function (eventName, callback) {
      socket.on(eventName, function () {
        var args = arguments;
        $rootScope.$apply(function () {
          callback.apply(socket, args);
        });
      });
    },
    emit: function (eventName, data, callback) {
      socket.emit(eventName, data, function () {
        var args = arguments;
        $rootScope.$apply(function () {
          if (callback) {
            callback.apply(socket, args);
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

