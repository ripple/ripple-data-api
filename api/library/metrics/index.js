var async = require('async');
var cacheTradeVolume = require('./tradeVolume');
var cachePaymentVolume = require('./paymentVolume');
var cacheNetworkValue = require('./networkValue');
var cacheIssuedValue = require('./issuedValue');

module.exports.init = function () {

  //cache metrics now
  cacheMetrics();

  //reset every 4 minutes
  setInterval(cacheMetrics, 4 * 60 * 1000);
}

function cacheMetrics () {
  async.series([
    function (callback) {cacheTradeVolume(null, callback)},
    function (callback) {cachePaymentVolume(null, callback)},
    //function (callback) {cacheNetworkValue(null, callback)},
    function (callback) {cacheIssuedValue(null, callback)}
  ]);
}
