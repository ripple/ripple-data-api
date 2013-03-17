var _ = require('lodash');

exports.issuers = {
  'WeExchange': {
    currencies: {
      "AUD": "rBcYpuDT1aXNo4jnqczWJTytKGdBGufsre",
      "BTC": "rpvfJ4mR6QQAeogpXEKnuyGBx8mYCSnYZi",
      "CAD": "r47RkFi1Ew3LvCNKT6ufw3ZCyj5AJiLHi9",
      "USD": "r9vbV3EHvXWjSkeQ6CAcYVPGeq7TuiXY2X"
    }
  },
  'Bitstamp': {
    currencies: {
      "USD": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
      "BTC": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
    },
    hotwallets: {
      'rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1': true
    }
  }
};

exports.markets = {
  "USD/Bitstamp:XRP": {},
  "BTC/Bitstamp:XRP": {},
  "USD/WeExchange:XRP": {},
  "BTC/WeExchange:XRP": {},
  "AUD/WeExchange:XRP": {},
  "CAD/WeExchange:XRP": {}
}

exports.tickers = {};

// Calculate tickers from observed markets
var i = 0;
_.each(exports.markets, function (data, symbol) {
  // Basically just resolve the issuer name into an address
  var t = symbol.split(':'), tmp2 = t[0].split('/'), tmp3 = t[1].split('/');
  var first = tmp2[0];
  if (first !== 'XRP') first += '/' + exports.issuers[tmp2[1]].currencies[first];
  var second = tmp3[0];
  if (second !== 'XRP') second += '/' + exports.issuers[tmp3[1]].currencies[second];

  // Initialize field with basic properties
  exports.tickers[first + ':' + second] = {
    id: i++,
    sym: symbol,
    first: first,
    second: second
  };
});
