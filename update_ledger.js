
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
    index = require('./indexes'),
    async = require('async');

var Engine = require('./engine').Engine,
    Range = require('./range').Range;

var app = module.exports = express();

var ledger_start = process.argv[2] | 0;
var ledger_end = process.argv[3] | 0;

if (!ledger_start) {
  console.log("Usage: node update_ledger.js <ledger> [to_ledger]");
  process.exit(1);
}

if (!ledger_end) ledger_end = ledger_start;

if ((ledger_end - ledger_start) > 1000000) {
  console.error("Error: Range too large");
  process.exit(2);
}

if (ledger_start < config.net.genesis_ledger) {
  console.error("Error: Ledger ID needs to be >= "+
                config.net.genesis_ledger);
  process.exit(3);
}

if (ledger_end < ledger_start) {
  console.error("Error: Start ledger must be less than end ledger");
  process.exit(4);
}

var ledgers = _.range(ledger_start, ledger_end+1);

var engine = new Engine();
engine.startup(function () {
  async.eachLimit(ledgers, config.perf.workers, function (ledger_index, callback) {
    engine.processor.processLedger(ledger_index, callback);
  }, function (err) {
    if (err) winston.error("Error processing ledger: " + err.message);
    else winston.info("Processing completed successfully");

    engine.shutdown();
  });
});
