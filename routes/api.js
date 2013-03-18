/*
 * Serve JSON to our AngularJS client
 */

var _ = require('lodash');

var markets = require('../markets').markets;

exports.name = function (req, res) {
  res.json({
  	name: 'Bob'
  });
};

function marketProcessRows(rows) {
  return _.map(rows, function (row) {
    return [
        +new Date(row.date).getTime(),
        +row.open,
      row.high,
      row.low,
        +row.close,
      row.vol
    ];
  });
}

exports.market_hourly = function (db) {
  return function (req, res) {
    var q = req.route.params;

    var symbol = q.first + "/" + q.second;

    if (markets[symbol]) {
      db.query(
        "SELECT " +
        "  DATE_FORMAT(time, '%Y %m %d %H:00:00') AS date, " +
        "  SUBSTRING_INDEX( GROUP_CONCAT(CAST(price AS CHAR) ORDER BY time), ',', 1 ) AS open, " +
        "  MAX(price) AS high, " +
        "  MIN(price) AS low, " +
        "  SUBSTRING_INDEX( GROUP_CONCAT(CAST(price AS CHAR) ORDER BY time DESC), ',', 1 ) AS close, " +
        "  COUNT(*) AS num, " +
        "  SUM(amount) AS vol " +
        "FROM `trades` " +
        "WHERE book = ? " +
        "GROUP BY TO_DAYS(time), HOUR(time)",
        [markets[symbol].id],
        function (err, rows) {
          if (err) {
            console.error(err);
            res.json(null);
            return;
          }

          res.json(marketProcessRows(rows));
        }
      );
    } else {
      res.json(null);
    }
  };
};

exports.market_daily = function (db) {
  return function (req, res) {
    var q = req.route.params;

    var symbol = q.first + "/" + q.second;

    if (markets[symbol]) {
      db.query(
        "SELECT " +
        "  DATE(time) AS date, " +
        "  SUBSTRING_INDEX( GROUP_CONCAT(CAST(price AS CHAR) ORDER BY time), ',', 1 ) AS open, " +
        "  MAX(price) AS high, " +
        "  MIN(price) AS low, " +
        "  SUBSTRING_INDEX( GROUP_CONCAT(CAST(price AS CHAR) ORDER BY time DESC), ',', 1 ) AS close, " +
        "  COUNT(*) AS num, " +
        "  SUM(amount) AS vol " +
        "FROM `trades` " +
        "WHERE book = ? " +
        "GROUP BY TO_DAYS(time)",
        [markets[symbol].id],
        function (err, rows) {
          if (err) {
            console.error(err);
            res.json(null);
            return;
          }

          res.json(marketProcessRows(rows));
        }
      );
    } else {
      res.json(null);
    }
  };
};

