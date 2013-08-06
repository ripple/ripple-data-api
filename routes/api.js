/*
 * Serve JSON to our AngularJS client
 */

var _ = require('lodash');

var index = require('../indexes');
var model = require('../model');

exports.name = function (req, res) {
  res.json({
  	name: 'Bob'
  });
};

exports.model = function (req, res) {
  res.json(model.data);
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
  var flip = true;
  if (c1 > c2 || (c1 === c2 && i1 > i2)) {
    var tmp;
    tmp = c1;
    c1 = c2;
    c2 = tmp;

    tmp = i1;
    i1 = i2;
    i2 = tmp;

    flip = false;
  }

  return [flip, c1, i1, c2, i2];
}

function marketProcessRows(rows, flip) {
  return _.map(rows, function (row) {
    return [
      new Date(row.date).getTime(),
      flip ? (1/row.open)  : +row.open,
      flip ? (1/row.low)   : +row.high,
      flip ? (1/row.high)  : +row.low,
      flip ? (1/row.close) : +row.close,
      flip ? +row.fvol     : +row.vol,
      row.price,
      flip ? (1/row.avg) : +row.avg
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
        "  SUM(amount) AS vol, " +
        "  SUM(amount*price) AS fvol, " +
        "  price " +
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

          res.json(marketProcessRows(rows, book[0]));
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
        "  SUM(amount) AS vol, " +
        "  SUM(amount*price) AS fvol, " +
        "  price, " +
        "  SUM( price * amount ) / SUM( amount ) AS avg " +
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

          res.json(marketProcessRows(rows, book[0]));
        }
      );
    } else {
      res.json(null);
    }
  };
};

//Return parameters for Caps process.
function capsProcessParam (q) {
  var currency_code = q.first.split(':')[0],
      issuer_name = q.first.split(':')[1];

  currency_id = index.currenciesByCode[currency_code].id;
  issuer_id = index.issuersByName[issuer_name].id || index.issuersByAddress[issuer_name].id;

  return [currency_id, issuer_id];
}

//Return real data from Caps rows.
function capsProcessRows(rows) {
  return _.map(rows, function (row) {
    return [
      new Date(row.date).getTime(),
      row.currency,
      row.issuer,
      row.type,
      row.ledger,
      row.val
    ];
  });
}

//Get all rows with parameters.
exports.caps_currency = function (db) {
  return function (req, res) {
    var q = req.route.params,
        caps_arr = capsProcessParam(q);
    if(caps_arr) {
	   db.query(
        "SELECT " +
        " c as currency, i as issuer, type, DATE(time) AS date, ledger, AVG(amount) as val " +
        "FROM caps " +
        "WHERE c = ? AND i = ? " +
        "GROUP BY type, TO_DAYS(time), HOUR(time)",
        caps_arr,
        function (err, rows) {
          if (err) {
            console.error(err);
            res.json(null);
            return;
          }

          res.json(capsProcessRows(rows));
        }
      );
    } else {
      res.json(null);
    }
  };
};

//Intraday
function intradayProcessRows(rows) {
  return _.map(rows, function (row) {
    return [
      new Date(row.date).getTime(),
      row.price,
      row.amount
    ];
  });
}

exports.intraday_trade = function (db) {
  return function (req, res) {
    var q = req.route.params,
        book = marketProcessParam(q),
        period = parseInt(req.query.period),
        start = req.query.start;
    book.push(start, period);
    if (book) {
      db.query(
        "SELECT " +
        "time AS date, price, amount " +
        "FROM trades " +
        "WHERE c1 = ? AND i1 = ? AND c2 = ? AND i2 = ? AND " + 
        "TIMESTAMPDIFF(HOUR, DATE_FORMAT(?, '%Y-%m-%d %H:%i:%s'), time) BETWEEN 0 AND ? ",
        book.slice(1),
        function (err, rows) {
          if (err) {
            console.error(err);
            res.json(null);
            return;
          }

          res.json(intradayProcessRows(rows));
        }
      );
    } else {
      res.json(null);
    }
  };
};

function newsRows (rows, total) {
  var news_rows = {};
  news_rows['total'] = total;
  news_rows['news_data'] = rows;
  return news_rows;
}

exports.news_data = function (db) {
  return function (req, res) {
    var page_index = req.route.params.first;
    var item_count = 3;
    page_index = (page_index*1-1) * item_count;
    if (page_index >= 0) {
      db.query("SELECT title, summary, url, publish_date " + 
        "FROM articles ORDER BY publish_date DESC LIMIT ?, ?",
        [page_index, item_count],
        function (err, rows) {
          if (err) {
            console.error(err);
            res.json(null);
            return;
          }
          db.query("SELECT count(*) AS total FROM articles", function (err, data) {
            if (err) {
              console.error(err);
              res.json(null);
              return;
            }
            var total_count = 0;			
            if(data && data[0])
              total_count = data[0].total;
            total_count = Math.ceil(total_count / item_count);
            res.json(newsRows(rows, total_count));
          });
        }
      );
    } else {
      res.json(null);
    }
  };
};

//Return real data from Transaction rows.
function transactionsProcessRows(rows) {
  return _.map(rows, function (row) {
    return [
      new Date(row.tx_date).getTime(),
      row.tx_num
    ];
  });
}

exports.transactions_data = function (db) {
  return function (req, res) {
    db.query("SELECT date_format(time, '%Y-%m-%d') AS tx_date, SUM(txs) AS tx_num FROM ledgers GROUP BY TO_DAYS(time) ORDER BY time", function(err, rows) {
      if (err)
      {
        console.error(err);
        res.json(null);
        return;
      }
      if (rows)
      {
        res.json(transactionsProcessRows(rows));
      }
	});
  };
};

exports.transmetric_data = function (db) {
  return function (req, res) {
    var metric = req.route.params.metric;
    
    db.query("SELECT date_format(time, '%Y-%m-%d') AS tx_date, SUM(??) AS tx_num FROM ledgers GROUP BY TO_DAYS(time) ORDER BY time",
             [metric],
             function(err, rows) {
      if (err)
      {
        console.error(err);
        res.json(null);
        return;
      }
      if (rows)
      {
        res.json(transactionsProcessRows(rows));
      }
	});
  };
};

exports.num_accounts = function(db) {
  return function (req, res) {
    
    db.query("SELECT date_format(time, '%Y-%m-%d') AS tx_date, SUM(accounts) AS tx_num FROM ledgers GROUP BY TO_DAYS(time) ORDER BY time",
             function(err, rows) {
      if (err)
      {
        console.error(err);
        res.json(null);
        return;
      }
      if (rows)
      {
        res.json(transactionsProcessRows(rows));
      }
	});
  };
};
