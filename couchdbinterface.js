var winston = require('winston'),
    _ = require('lodash'),
    async = require('async'),
    moment = require('moment'),
    fs = require('fs');

var config = require('./config');
var db = require('nano')('http://' + config.couchdb.username + ':' + config.couchdb.password + '@' + config.couchdb.host + ':' + config.couchdb.port + '/' + config.couchdb.database);



function getXrpBalances() {
    var filename = "./spreadsheets/xrp_balances_" + moment().format("YYYY-MM-DD") + ".csv";

    fs.readFile("32570_full.json", {
        encoding: 'utf8'
    }, function(err, res) {
        if (err) {
            winston.error("Error getting 32570_full.json");
            return;
        }

        var ledger = JSON.parse(res).result.ledger;

        var genesis_accounts = {};
        _.each(ledger.accountState, function(acct) {
            if (typeof acct.Account === "string" && typeof acct.Balance === "string")
                genesis_accounts[acct.Account] = {
                    in_later_ledgers: false,
                    balance: parseInt(acct.Balance)
                };
        });

        var header = ["account", "xrp"].join(',') + '\n';
        fs.writeFileSync(filename, header);

        function writeRow (row) {
            if (typeof row === "object" && row.length === 2) {
                // winston.info(row);
                var key = row[0],
                    value = row[1];
                var csv_row = [key[0], value[0]].join(',') + '\n';
                fs.appendFile(filename, csv_row, function(err) {
                    if (err) {
                        winston.error("Error writing to file:", err);
                        return;
                    }
                    if (typeof genesis_accounts[key[0]] !== "undefined")
                        genesis_accounts[key[0]].in_later_ledgers = true;
                });
            } else {
                winston.error("Error, row must be an array of length 2");
                return;
            }
        }

        var req = db.view_with_list("rphist", "xrp_totals", "streamRows", {
            group_level: 1
        });
        var incomplete_chunks = "";
        req.on("data", function(chunk) {
            try {
                var row = JSON.parse(chunk);
                writeRow(filename, row);
            } catch (e) {
                incomplete_chunks += chunk;
            }

        });

        req.on("error", function(err) {
            if (err) {
                winston.error("Error getting xrp_totals:", err);
                return;
            }
        });

        req.on("end", function() {
            // winston.info("incomplete_chunks:", incomplete_chunks);
            var rows = incomplete_chunks.split("\n");
            _.each(rows, function(row){
                try {
                    var parsed_row = JSON.parse(row);
                    writeRow(filename, parsed_row);
                } catch (e) {
                    winston.error("could not parse", parsed_row);
                }

            });

            _.each(Object.keys(genesis_accounts), function(acct_addr) {
                if (genesis_accounts[acct_addr].in_later_ledgers === false) {
                    var bal = genesis_accounts[acct_addr].balance;
                    fs.appendFile(filename, ("" + acct_addr + "," + bal + "\n"));
                }
            });

            winston.info("Wrote to file:", filename);

        });

    });

}


getTrades(["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"], ["XRP"], "2013-10-1", "2013-11-1", "month");

function getTrades(curr1, curr2, start, end, time_period) {
    // curr1 and curr2 should be arrays of the form ["CUR", "r...issuer"]

    var filename = "./spreadsheets/trades_" + 
                    curr1[0] + (curr1.length === 2 ? curr1[1] : "") + 
                    "_for_" + 
                    curr2[0] + (curr2.length === 2 ? curr2[1] : "") + "_" + 
                    start + "_to_" + end + 
                    "_by_" + time_period + 
                    ".csv";

    var time_periods = ["year", "month", "day", "hour", "minute", "second"],
        period_index = (time_periods.indexOf(time_period) >= 0 ? time_periods.indexOf(time_period) : 3),
        start_array = moment(start).utc().toArray().slice(0, period_index + 1),
        end_array = moment(end).utc().toArray().slice(0, period_index + 1),
        group_level = period_index + 3;

    var startkey = [curr1, curr2].concat(end_array),
        endkey = [curr1, curr2].concat(start_array);

    var params = {
        descending: true,
        startkey: startkey,
        endkey: endkey,
        group_level: group_level
    };

    var csv_header = ["timestamp", "open", "high", "low", "close", "vwav", "curr1_volume", "curr2_volume"].join(',') + "\n";
    fs.writeFileSync(filename, csv_header);

    function writeRow (filename, row) {
        var key = row[0],
            value = row[1];
            var time = moment(key.slice(2)).utc().format();

            var csv_row = [
                time,
                value.open,
                value.high,
                value.low,
                value.close,
                value.volume_weighted_avg,
                value.curr1_volume,
                value.curr2_volume
            ].join(',') + "\n";

            fs.appendFile(filename, csv_row);
        }

    var req = db.view_with_list("offers", "offersExercised", "streamRows", params);
    var incomplete_chunks = "";
    req.on("data", function(chunk) {
        try {
            var parsed_row = JSON.parse(chunk);
            writeRow(filename, parsed_row);
        } catch (e) {
            incomplete_chunks += chunk;
        }

    });

    req.on("error", function(err) {
        if (err) {
            winston.error("Error getting xrp_totals:", err);
            return;
        }
    });

    req.on("end", function() {
        // winston.info("incomplete_chunks:", incomplete_chunks);
        var rows = incomplete_chunks.split("\n");
        _.each(rows, function(row){
            if (row === "")
                return;
            try {
                var parsed_row = JSON.parse(row);
                if (typeof parsed_row === "object")
                    writeRow(filename, parsed_row);
            } catch (e) {
                winston.error("could not parse", JSON.stringify(parsed_row));
            }
        });

        winston.info("Wrote to file:", filename);
    });

}


// function getGateways (startkey) {

//     db.view("rphistory", "trustlinesByCurrency", {group_level: 2, limit: 1000}, function(err, body){
//         if (err) {
//             winston.info("Error getting trustlinesByCurrency:", err);
//             return;
//         }

//         var gateways = {};
//         _.each(body.rows, function(row){
//             var acct = row.key[1],
//                 curr = row.key[0];

//             /* 
//             Gateway heuristic:
//                 > 100 incoming trustlines
//                 < 0 balance for given currency
//             */
//             if (row.value.incoming >= 100
//                 && row.value.balance_change < 0) {

//                 if (typeof gateways[acct] === "undefined")
//                     gateways[acct] = {};

//                 gateways[acct][curr] = {
//                     trust_in: row.value.incoming,
//                     trust_out: row.value.outgoing,
//                     balance: row.value.balance_change
//                 };
//             }
//         });

//         winston.info(JSON.stringify(gateways));
//         getGateways(body.rows[body.rows.length - 1]);
//     });
// }