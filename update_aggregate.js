
/**
 * Module dependencies.
 */

var express = require('express'),
    extend = require('extend'),
    fs = require('fs'),
    _ = require('lodash'),
    winston = require('winston'),
    config = require('./config'),
    routes = require('./routes'),
    api = require('./routes/api'),
    model = require('./model'),
    interp = require('./interpreter'),
    index = require('./indexes');

var utils = require('ripple-lib').utils;

var Engine = require('./engine').Engine,
    Range = require('./range').Range;

var app = module.exports = express();

var ledger_index = process.argv[2] | 0;

if (!ledger_index) {
  console.log("Usage: node update_aggregate.js [ledger]");
  process.exit(1);
}

var engine = new Engine();
engine.startup(function () {
  engine.processor.getLedger(ledger_index, function (err, e) {
    if (err) winston.error("Error loading ledger: " + err.message);
    else {
      var ledger_time = new Date(utils.toTimestamp(e.ledger.close_time));
      engine.aggregator.process(ledger_time, null, function (err) {
        if (err) winston.error("Error processing aggregate: " + err.message);
        engine.shutdown();
      });
    }
  });
});
