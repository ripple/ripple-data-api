/*
 * Serve JSON to our AngularJS client
 */

var _ = require('lodash');

var index = require('../indexes');

exports.name = function (req, res) {
  res.json({
  	name: 'Bob'
  });
};

function marketProcessParam(q) {
  var c1s = q.first.split(':')[0],
      i1s = q.first.split(':')[1],
      c2s = q.second.split(':')[0],
      i2s = q.second.split(':')[1];

  c1s = index.currenciesByCode[c1s];
  c2s = index.currenciesByCode[c2s];
  i1s = index.issuersByName[i1s] || index.issuersByAddress[i1s];
  i2s = index.issuersByName[i2s] || index.issuersByAddress[i2s];

  if (!c1s || !c2s) return false;

  var c1 = c1s.id,
      c2 = c2s.id,
      i1,
      i2;

  if (c1 > 0) {
    if (!i1s) return false;
    i1 = i1s.id;
  } else i1 = 0;

  if (c2 > 0) {
    if (!i2s) return false;
    i2 = i2s.id;
  } else i2 = 0;

  // Flip it if necessary
  var flipped = true;
  if (c1 > c2 || (c1 === c2 && i1 > i2)) {
    var tmp;
    tmp = c1;
    c1 = c2;
    c2 = tmp;

    tmp = i1;
    i1 = i2;
    i2 = tmp;

    flipped = false;
  }

  return [flipped, c1, i1, c2, i2];
}

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
    var q = req.route.params,
        book = marketProcessParam(q);

    if (book) {
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
        "WHERE `c1` = ? AND `i1` = ? AND `c2` = ? AND `i2` = ? " +
        "GROUP BY TO_DAYS(time), HOUR(time)",
        book.slice(1),
        function (err, rows) {
          if (err) {
            console.error(err);
            res.json(null);
            return;
          }

          // XXX: Flip if needed

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
    var q = req.route.params,
        book = marketProcessParam(q);

    if (book) {
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
        "WHERE `c1` = ? AND `i1` = ? AND `c2` = ? AND `i2` = ? " +
        "GROUP BY TO_DAYS(time)",
        book.slice(1),
        function (err, rows) {
          if (err) {
            console.error(err);
            res.json(null);
            return;
          }

          // XXX: Flip if needed

          res.json(marketProcessRows(rows));
        }
      );
    } else {
      res.json(null);
    }
  };
};

