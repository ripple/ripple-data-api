/**
 * markets.js
 *
 * This is the main configuration file for setting which issuers and markets to
 * track and list.
 *
 * WARNING: The ordering of entries here is used for the database IDs, so
 * anything other than appending new entries will invalidate the database.
 */

// Curated list of named issuers
// *APPEND ONLY*
exports.issuers = [{
  name: "WeExchange",
  url: "https://weexchange.co/",
  currencies: {
    "AUD": "rBcYpuDT1aXNo4jnqczWJTytKGdBGufsre",
    "BTC": "rpvfJ4mR6QQAeogpXEKnuyGBx8mYCSnYZi",
    "CAD": "r47RkFi1Ew3LvCNKT6ufw3ZCyj5AJiLHi9",
    "USD": "r9vbV3EHvXWjSkeQ6CAcYVPGeq7TuiXY2X"
  }
}, {
  name: "Bitstamp",
  url: "https://www.bitstamp.net/",
  currencies: {
    "USD": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "BTC": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "EUR": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "GBP": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "JPY": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "CHF": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "AUD": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"
  },
  hotwallets: {
    'rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1': true
  }
}, {
  name: "TheRock",
  url: "https://www.therocktrading.com/",
  currencies: {
//    "EUR": "rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun",
    "SLL": "rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun"
  }
}, {
  name: "RippleUnion",
  url: "http://rippleunion.com/",
  currencies: {
    "CAD": "r3ADD8kXSUKHd6zTCKfnKT3zV9EZHjzp1S"
  }
}, {
  name: "chriswen",
  url: "https://bitcointalk.org/index.php?topic=155124.0",
  currencies: {
    "LTC": "rDihBcUrrfDwUBZWBcuP2z5n47KVLQFNQH"
  }
}];

// Curated list of currencies
// *APPEND ONLY*
exports.currencies = [
  'XRP',
  'BTC',
  'USD',
  'EUR',
  'JPY',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'ZAR',
  'SLL',
  'LTC'
];

// Highlighted XRP markets
exports.xrp = [
  "USD:Bitstamp",
  "BTC:Bitstamp",
  "USD:WeExchange",
  "BTC:WeExchange",
  "AUD:WeExchange"
//"CAD:WeExchange"
];
