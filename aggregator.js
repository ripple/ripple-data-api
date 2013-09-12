var config = require('./config');

var _ = require('lodash');
var winston = require('winston');
var moment = require('moment');

function logError(err) {
  winston.error(err.stack ? err.stack : (err.message ? err.message : err));
}

var Aggregator = function (db)
{
  this.db = db;

  this.updateAlways = false;
  this.aggregationInterval = config.stats.aggregation_interval * 1000;
};

Aggregator.prototype.process = function (timestamp, lastTimestamp, callback)
{
  var self = this;

  if ("function" !== typeof callback) callback = function (err) {
    if (err) winston.error(err);
  };

  if (!this.updateAlways &&
      lastTimestamp instanceof Date) {
    var timeDelta = timestamp.getTime() - lastTimestamp.getTime();
    if (timeDelta < this.aggregationInterval) {
      // We're within the aggregationInterval, don't aggregate
      return false;
    }
  }

  var periodStart = new Date(
    Math.floor(timestamp.getTime() / this.aggregationInterval)
      * this.aggregationInterval);
  var periodEnd = new Date(
    periodStart.getTime() + this.aggregationInterval - 1);

  winston.info("Aggregating " + moment(periodStart).format("M/D/YY HH:mm") +
               " to " + moment(periodEnd).format("M/D/YY HH:mm"));

  updateLedgersAggregate();

  function updateLedgersAggregate() {
    self.db.query("REPLACE INTO ledgers_aggregate "+
                  "(time, ledger_first, ledger_last, txs_count) "+
                  "SELECT ? AS srctime, MIN(id), MAX(id), SUM(txs) "+
                  "FROM ledgers "+
                  "WHERE time >= ? AND time <= ? ",
                  [periodStart, periodStart, periodEnd],
                  function(err) {
      if (err) callback(err);
      else callback();
    });
  }

  return true;
};

exports.Aggregator = Aggregator;
