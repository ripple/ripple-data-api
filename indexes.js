/**
 * indexes.js
 *
 * This file acts as a layer on top of markets.js to provide indexes and
 * slightly processed versions of those market definitions.
 */

var _ = require('lodash');

var markets = require('./markets');

// Process issuers
exports.issuers = _.map(markets.issuers, function (issuer, i) {
  return _.merge({id: i}, issuer);
});

// Index issuers
exports.issuersByAddress = {};
exports.issuersByIOU = {};
exports.issuersByName = {};
exports.issuerByCurrencyAddress = {};
exports.issuers.forEach(function (issuer, i) {
  _.each(issuer.currencies, function (address, cur) {
    exports.issuersByAddress[address] = issuer;
    exports.issuersByIOU[cur + ':' + address] = issuer;
    exports.issuerByCurrencyAddress[cur + ':' + address] = issuer;
  });
  exports.issuersByName[issuer.name] = issuer;
});

// -----------------------------------------------------------------------------

// Process currencies
exports.currencies = _.map(markets.currencies, function (currency, i) {
  return {
    id: i,
    cur: currency
  };
});

// Index currencies
exports.currenciesByCode = {};
exports.currencies.forEach(function (cur) {
  exports.currenciesByCode[cur.cur] = cur;
});

// -----------------------------------------------------------------------------

// Process XRP markets
exports.xrp = [];
_.each(exports.issuers, function (issuer) {
  _.each(issuer.currencies, function (address, currency) {
    exports.xrp.push({
      sym: currency + ":" + issuer.name,
      first: currency + "/" + address,
      second: "XRP",
      cur: exports.currenciesByCode[currency],
      iss: issuer
    });
  });
});

// Index XRP markets
exports.xrpByCur = {};
exports.xrp.forEach(function (market) {
  exports.xrpByCur[market.iou] = market;
});
