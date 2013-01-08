'use strict';

/* Controllers */

function AppCtrl($scope, socket) {
  socket.on('apply', function (data) {
    angular.extend($scope, data);
  });
}

function DashboardCtrl() {}
DashboardCtrl.$inject = [];

