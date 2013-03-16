'use strict';

var Amount = ripple.Amount;

/* Filters */
var module = angular.module('myApp.filters', []);

module.filter('interpolate', ['version', function(version) {
  return function(text) {
    return String(text).replace(/\%VERSION\%/mg, version);
  };
}]);


/**
 * Format a ripple.Amount.
 *
 * If the parameter is a number, the number is treated the relative 
 */
module.filter('rpamount', function () {
  return function (input, opts) {
    if ("number" === typeof opts) {
      opts = {
        rel_min_precision: opts
      };
    } else if ("object" !== typeof opts) {
      opts = {};
    }

    if (!input) return "n/a";

    var amount = Amount.from_json(input);
    if (!amount.is_valid()) return "n/a";

    // Currency default precision
    var currency = [0, 2];//iso4217[amount.currency().to_json()];
    var cdp = ("undefined" !== typeof currency) ? currency[1] : 2;

    // Certain formatting options are relative to the currency default precision
    if ("number" === typeof opts.rel_precision) {
      opts.precision = cdp + opts.rel_precision;
    }
    if ("number" === typeof opts.rel_min_precision) {
      opts.min_precision = cdp + opts.rel_min_precision;
    }

    // If no precision is given, we'll default to max precision.
    if ("number" !== typeof opts.precision) {
      opts.precision = 16;
    }

    var out = amount.to_human(opts);

    return out;
  };
});

module.filter('rpdate', [function() {
  return function(text) {
    return text && moment(+text).format('MMMM Do YYYY, h:mm:ss a');
  };
}]);

module.filter('rpago', [function() {
  return function(text) {
    return text && moment(+text).fromNow();
  };
}]);
