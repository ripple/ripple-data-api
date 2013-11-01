var winston = require('winston'),
    _ = require('lodash'),
    async = require('async'),
    moment = require('moment'),
    fs = require('fs');

var config = require('./config');
var db = require('nano')('http://' + config.couchdb.username + ':' + config.couchdb.password + '@' + config.couchdb.host + ':' + config.couchdb.port + '/' + config.couchdb.database);

getXrpBalances();

function getXrpBalances() {
    var filename = "xrp_balances_" + moment().format("YYYY-MM-DD") + ".csv";

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
                writeRow(row);
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
                    writeRow(parsed_row);
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


// getTrades(["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"], ["XRP"], "2013-10-1", "2013-10-31", "hour");

function getTrades(curr1, curr2, start, end, time_period) {
    // curr1 and curr2 should be arrays of the form ["CUR", "r...issuer"]

    var filename = "trades_" + curr1[0] + (curr1.length === 2 ? curr1[1] : "") + "_for_" + curr2[0] + (curr2.length === 2 ? curr2[1] : "") + "_" + start + "_to_" + end + ".csv";

    var start_moment = moment(start).utc(),
        end_moment = moment(end).utc(),
        start_array = start_moment.toArray(),
        end_array = end_moment.toArray(),
        group_level;

    if (time_period === "year" || time_period === "yearly") {
        start_array = start_array.slice(0, 1);
        end_array = end_array.slice(0, 1);
        group_level = 3;
    } else if (time_period === "month" || time_period === "monthly") {
        start_array = start_array.slice(0, 2);
        end_array = end_array.slice(0, 2);
        group_level = 4;
    } else if (time_period === "day" || time_period === "daily") {
        start_array = start_array.slice(0, 3);
        end_array = end_array.slice(0, 3);
        group_level = 5;
    } else if (time_period === "hour" || time_period === "hourly") {
        start_array = start_array.slice(0, 4);
        end_array = end_array.slice(0, 4);
        group_level = 6;
    } else if (time_period === "minute") {
        start_array = start_array.slice(0, 5);
        end_array = end_array.slice(0, 5);
        group_level = 7;
    } else if (time_period === "second") {
        start_array = start_array.slice(0, 6);
        end_array = end_array.slice(0, 6);
        group_level = 8;
    } else {
        callback(new Error("Error: time_period option not valid"));
    }

    var startkey = [curr1, curr2].concat(end_array),
        endkey = [curr1, curr2].concat(start_array);

    var params = {
        descending: true,
        startkey: startkey,
        endkey: endkey,
        group_level: group_level
    };

    var req = db.view_with_list("offers", "offersExercised", "trades", params);
    req.on("data", function(chunk) {
        winston.info(JSON.parse(chunk));
    });

    // {
    //     if (err) {
    //         winston.error("Error getting offersExercised:", err);
    //         return;
    //     }

    //     // var time_periods = ["year", "month", "day", "hour", "minute", "second"].slice(0, res.rows[0].key.slice(2).length);
    //     var csv_header = ["timestamp", "open", "high", "low", "close", "vwav", "volume"].join(',') + "\n";
    //     fs.writeFileSync(filename, csv_header);

    //     res.rows.forEach(function(row){
    //         var time = moment(row.key.slice(2)).utc().format();

    //         var csv_row = [
    //             time,
    //             row.value.start,
    //             row.value.high,
    //             row.value.low,
    //             row.value.end,
    //             row.value.volume_weighted_avg,
    //             row.value.vwav_denominator
    //         ].join(',') + "\n";

    //         fs.appendFileSync(filename, csv_row);
    //     });

    //     winston.info("Wrote to file:", filename);
    // });

    // db.view("offers", "offersExercised", params, function(err, res){
    //     if (err) {
    //         winston.error("Error getting offersExercised:", err);
    //         return;
    //     }

    //     // var time_periods = ["year", "month", "day", "hour", "minute", "second"].slice(0, res.rows[0].key.slice(2).length);
    //     var csv_header = ["timestamp", "open", "high", "low", "close", "vwav", "volume"].join(',') + "\n";
    //     fs.writeFileSync(filename, csv_header);

    //     res.rows.forEach(function(row){
    //         var time = moment(row.key.slice(2)).utc().format();

    //         var csv_row = [
    //             time,
    //             row.value.start,
    //             row.value.high,
    //             row.value.low,
    //             row.value.end,
    //             row.value.volume_weighted_avg,
    //             row.value.vwav_denominator
    //         ].join(',') + "\n";

    //         fs.appendFileSync(filename, csv_row);
    //     });

    //     winston.info("Wrote to file:", filename);
    // });

}

// function getGateways (callback) {
//     function perPageFn (rows, page_callback) {

//     }

//     paginateView(db, "rphistory", "trustlinesByAccount", {group_level: 2}, perPageFn, callback);

// }

// function paginateView (db, ddoc, view, params, pagefn, callback) {
//     var page_size = 1000 + 1;
//     if (!params.limit || params.limit < page_size)
//         params.limit = page_size;

//     db.view(ddoc, view, params, function(err, rows){
//         if (err) {
//             winston.error("Error getting view", view, "err:", err);
//             return;
//         }

//         if (rows.length === page_size) {
//             // not last page

//             setImmediate(function(){
//                 pagefn(rows, function(err, results){
//                     if (err) {
//                         if (callback) {
//                             callback(err);
//                         } else {
//                             winston.error("Error paginating view", view, "err:", err);
//                             return;
//                         }
//                     }
//                     params.startkey = results.last_key;
//                     paginateView(db, ddoc, view, params, pagefn, callback);
//                 });
//             });

//         } else {

//             // last page
//             pagefn(rows, function(err, last_key){
//                 if (err) {
//                     if (callback) {
//                         callback(err);
//                     } else {
//                         winston.error("Error paginating view", view, "err:", err);
//                         return;
//                     }
//                 }

//                 callback(last_key);
//             })

//         }

//     });
// }

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