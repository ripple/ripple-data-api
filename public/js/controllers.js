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

