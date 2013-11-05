var winston = require('winston'),
    _ = require('lodash'),
    async = require('async'),
    moment = require('moment'),
    fs = require('fs');

var config = require('./config');
var db = require('nano')('http://' + config.couchdb.username + ':' + config.couchdb.password + '@' + config.couchdb.host + ':' + config.couchdb.port + '/' + config.couchdb.database);

var GENESIS_LEDGER = require('./32570_full.json').result.ledger,
    GENESIS_ACCOUNTS = GENESIS_LEDGER.accountState;



getXrpBalances();

function getAllOrderBooks() {
    // run getGateways first
    var gateways = require('./spreadsheets/gateways_2013-11-04.json'),
    gateway_accts = Object.keys(gateways);

    for (var g1 = 0; g1 < gateway_accts.length; g1++) {
        var g1_acct = gateway_accts[g1],
            g1_currs = Object.keys(gateways[g1_acct]);

        g1_currs.forEach(function(g1_curr){
                getTrades(
                    [g1_curr, g1_acct], 
                    ["XRP"],
                    "2013-05-01",
                    "2013-11-04",
                    "day");
            });

        for (var g2 = g1; g2 < gateway_accts.length; g2++) {
            var g2_acct = gateway_accts[g2],
                g2_currs = Object.keys(gateways[g2_acct]);

            g1_currs.forEach(function(g1_curr){
                g2_currs.forEach(function(g2_curr){
                    getTrades(
                        [g1_curr, g1_acct], 
                        [g2_curr, g2_acct],
                        "2013-05-01",
                        "2013-11-04",
                        "day");
                })
            });
        }
    }
}



// getGateways();

// getAccountsCreated("day");

function getAccountsCreated(time_period) {
    var filename = "./spreadsheets/accountsCreated_by_" + time_period + ".csv";

    var csv_header = ["timestamp", "delta", "total"].join(",") + "\n";
    fs.writeFileSync(filename, csv_header);

    var time_periods = ["year", "month", "day", "hour", "minute", "second"],
        period_index = (time_periods.indexOf(time_period) >= 0 ? time_periods.indexOf(time_period) : 2);


    var total = 0;
    GENESIS_ACCOUNTS.forEach(function(acct){
        if (typeof acct.Account === "string")
            total++;
    });

    db.view("accounts", "accountsCreated", {
        group_level: period_index + 1
    }, function(err, res) {
        if (err) {
            winston.error("Error getting accountsCreated:", err);
            return;
        }

        winston.info(JSON.stringify(res));

        res.rows.forEach(function(row) {
            var date = row.key;
            date[1]++;
            var date_str = date.slice(0, 3).join("-") + " " + date.slice(3).join(":");

            total += row.value;

            var csv_row = [
                date_str,
                row.value,
                total
            ].join(",") + "\n";

            fs.appendFileSync(filename, csv_row);
        });
    });
}


function getGateways(startkey, callback) {
    if (typeof callback !== "function")
        callback = function(err) {
            if (err) {
                winston.error(err);
                return;
            }
        };

    var filename = "./spreadsheets/gateways_" + moment().format("YYYY-MM-DD");

    var csv_header = ["account", "currency", "trust_in", "trust_out", "balance_change"].join(",") + "\n";
    fs.writeFileSync(filename + ".csv", csv_header);

    db.view_with_list("trustlineStats", "trustlineStatsByCurrency", "gateways", {
        group_level: 2
    }, function(err, res) {
        callback(err);

        var rows = [];
        res.split("\n").forEach(function(row_str) {
            if (row_str !== "")
                rows.push(JSON.parse(row_str));
        });

        var gateways = {};
        _.each(rows, function(row) {

            var acct = row.key[1],
                curr = row.key[0];

            // gateway heuristics
            if (row.value.incoming >= 50 && row.value.balance_change < -10 && row.value.outgoing < 20) {

                if (typeof gateways[acct] === "undefined")
                    gateways[acct] = {};

                gateways[acct][curr] = {
                    trust_in: row.value.incoming,
                    trust_out: row.value.outgoing,
                    balance: row.value.balance_change
                };

                var csv_row = [acct, curr, row.value.incoming, row.value.outgoing, row.value.balance_change].join(",") + "\n";
                fs.appendFileSync(filename + ".csv", csv_row);
            }

        });
        fs.writeFileSync(filename + ".json", JSON.stringify(gateways));
        // winston.info("Wrote gateways to files:", (filename + ".csv"), "and", (filename + ".json"));

        callback(null, gateways);
    });
}


function getXrpBalances() {
    var filename = "./spreadsheets/xrp_balances_" + moment().format("YYYY-MM-DD") + ".csv";


    // parse genesis accounts
    var genesis_accounts = {};
    _.each(GENESIS_ACCOUNTS, function(acct) {
        if (typeof acct.Account === "string" && typeof acct.Balance === "string")
            genesis_accounts[acct.Account] = {
                in_later_ledgers: false,
                balance: parseInt(acct.Balance, 10)
            };
    });

    var header = ["account", "xrp"].join(',') + '\n';
    fs.writeFileSync(filename, header);

    // get couchdb view
    db.view("xrp", "xrp_totals", {
        group_level: 1
    }, function(err, res) {
        if (err) {
            winston.error("Error getting xrp_totals:", err);
            return;
        }

        res.rows.forEach(function(row) {
            var key = row.key,
                value = row.value;
            var csv_row = [key[0], value[0]].join(',') + '\n';
            fs.appendFileSync(filename, csv_row);

            // mark which of the genesis accounts appear in later ledgers
            if (typeof genesis_accounts[key[0]] !== "undefined")
                genesis_accounts[key[0]].in_later_ledgers = true;
        });

        fs.appendFileSync(filename, "\n");

        // add the accounts from the effective genesis ledger that never appeared in later ledgers
        Object.keys(genesis_accounts).forEach(function(acct_addr) {
            if (genesis_accounts[acct_addr].in_later_ledgers === false) {
                var bal = genesis_accounts[acct_addr].balance;
                fs.appendFileSync(filename, ("" + acct_addr + "," + bal + "\n"));
            }
        });

        winston.info("Wrote to file:", filename);
    });
}



function getTrades(curr1, curr2, start, end, time_period) {
    // curr1 and curr2 should be arrays of the form ["CUR", "r...issuer"]

    var gateway_names = {
        "rNPRNzBB92BVpAhhZr4iXDTveCgV5Pofm9": "RippleIsrael",
        "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B": "Bitstamp",
        "rfYv1TXnwgDDK4WQNbFALykYuEBnrR4pDX": "DividendRippler",
        "rGwUWgN5BEg3QGNY3RX2HfYowjUTZdid3E": "DYM",
        "rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK": "RippleCN",
        "r3ADD8kXSUKHd6zTCKfnKT3zV9EZHjzp1S": "RippleUnion",
        "rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun": "TheRockTrading",
        "rM8199qFwspxiWNZRChZdZbGN5WrCepVP1": "XRPchina",
        "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA": "RippleChina",
        "rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q": "SnapSwap"
    };

    var first_issuer = gateway_names[curr1[1]],
        second_issuer = gateway_names[curr2[1]];

    var filename = "./spreadsheets/trades/" +
        curr1[0] + (curr1.length === 2 ? first_issuer : "") +
        "_for_" +
        curr2[0] + (curr2.length === 2 ? second_issuer : "") + "_" +
        start + "_to_" + end +
        "_by_" + time_period +
        ".csv";

    var time_periods = ["year", "month", "day", "hour", "minute", "second"],
        period_index = (time_periods.indexOf(time_period) >= 0 ? time_periods.indexOf(time_period) : 3),
        start_array = moment(start + " 00:00:00 +0000").utc().toArray(),
        end_array = moment(end + " 00:00:00 +0000").utc().toArray(),
        group_level = period_index + 3;
    start_array = start_array.slice(0, period_index + 1).concat([0, 0, 0, 0, 0, 0].slice(period_index + 1));
    end_array = end_array.slice(0, period_index + 1).concat([9999, 12, 31, 23, 59, 59].slice(period_index + 1));

    var startkey = [curr1, curr2].concat(end_array),
        endkey = [curr1, curr2].concat(start_array);

    var params = {
        descending: true,
        startkey: startkey,
        endkey: endkey,
        group_level: group_level
    };

    // winston.info("startkey:", JSON.stringify(startkey));
    // winston.info("endkey:", JSON.stringify(endkey));
    // winston.info("group_level:", group_level);

    var csv_header = ["timestamp", "open_time", "close_time", "", "curr1_volume", "open", "high", "low", "close", "", "vwav", "curr2_volume", "num_trades"].join(',') + "\n";
    fs.writeFileSync(filename, csv_header);

    db.view("offers", "offersExercised", params, function(err, res) {
        if (err) {
            winston.error("Error getting offersExercised:", err);
            return;
        }

        var sorted_rows = res.rows.sort(function(a, b){
            var first_date_arr = a.key.slice(2),
                second_date_arr = b.key.slice(2);
            first_date_arr[1]++;
            second_date_arr[1]++;

            if (lessThan(first_date_arr, second_date_arr))
                return -1;
            else 
                return 1;

            function lessThan(arr1, arr2) {
                if (arr1.length !== arr2.length)
                    return false;

                for (var i = 0; i < arr1.length; i++) {
                    if (arr1[i] < arr2[i]) {
                        return true;
                    } else if (arr1[i] > arr2[i]) {
                        return false;
                    } else {
                        continue;
                    }
                }

                return false;
            }
        });

        sorted_rows.forEach(function(row) {
            var date = row.key.slice(2),
                open_time = row.value.open_time,
                close_time = row.value.close_time;

            // add 1 to the month field to account for zero-based indexing
            date[1]++;
            open_time[1]++;
            close_time[1]++;

            var csv_row = [
                date.slice(0, 3).join("-") + " " + date.slice(3).join(":"),
                open_time.slice(0, 3).join("-") + " " + open_time.slice(3).join(":"),
                close_time.slice(0, 3).join("-") + " " + close_time.slice(3).join(":"),
                "",
                row.value.curr1_volume,
                row.value.open,
                row.value.high,
                row.value.low,
                row.value.close,
                "",
                row.value.volume_weighted_avg,
                row.value.curr2_volume,
                row.value.num_trades
            ].join(',') + "\n";

            fs.appendFileSync(filename, csv_row);
        });

        winston.info("Wrote to file:", filename);

    });
}