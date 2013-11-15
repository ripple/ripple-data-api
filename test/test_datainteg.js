/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote,
    Amount = require('ripple-lib').Amount;

var config = require('./config'),
    db = require('nano')('http://' + config.couchdb.username + ':' + config.couchdb.password + '@' + config.couchdb.host + ':' + config.couchdb.port + '/' + config.couchdb.database);

var remote = new Remote({
    // options
    servers: [{
        host: "s1.ripple.com",
        port: 443,
        secure: true
    }]
});

remote.connect(function() {
    remote.on('transaction_all', transactionListener);
});

var stats = {
    open_index: 9999999999,
    close_index: 0,
    bitstampUSD_traded: 0,
    xrp_traded: 0,
    high: 0,
    low: 9999999999,
    open: 0,
    close: 0
}

    function compareToCouch(stats) {
        console.log("got trade, waiting to check couchdb");

        setTimeout(function() {

            db.view("indexesAndTimes", "indexesAndTimesByIndex", {
                key: stats.open_index
            }, function(err1, res1) {
                if (err1) {
                    throw (err1);
                }
                var open_time = res1.rows[0].value;
                // open_time[open_time.length-1]--;
                console.log("time for ledger_index " + stats.open_index + " is " + JSON.stringify(open_time));

                db.view("indexesAndTimes", "indexesAndTimesByIndex", {
                    key: stats.close_index
                }, function(err2, res2) {
                    if (err2) {
                        throw (err2);
                    }

                    var close_time = res2.rows[0].value;
                    // close_time[close_time.length-1]++;
                    console.log("time for ledger_index " + stats.close_index + " is " + JSON.stringify(close_time));


                    var startkey = [
                        ["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"],
                        ["XRP"]
                    ].concat(open_time),
                        endkey = [
                            ["USD", "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"],
                            ["XRP"]
                        ].concat(close_time);

                    db.view("offers", "offersExercised", {
                        startkey: startkey,
                        endkey: endkey,
                        group_level: 0,
                        inclusive_end: true
                    }, function(err, res) {
                        if (err) {
                            throw (err);
                        }
                        console.log("\ncompare this:");
                        console.log(JSON.stringify(res));
                        console.log("to this:");
                        console.log(JSON.stringify(stats) + "\n");
                    });

                });
            });

        }, 30000);
    }

    function transactionListener(transaction_data) {
        // console.log(JSON.stringify(transaction_data));
        if (transaction_data.transaction.TransactionType === "Payment" || transaction_data.transaction.TransactionType === "OfferCreate") {

            var ledger_index = transaction_data.ledger_index,
                affNodes = transaction_data.meta.AffectedNodes;

            affNodes.forEach(function(n) {
                // console.log(JSON.stringify(node));
                var node = n.ModifiedNode || n.DeletedNode;
                if (typeof node === "undefined" || node.LedgerEntryType !== "Offer")
                    return;

                if (node.PreviousFields && node.PreviousFields.TakerPays && node.PreviousFields.TakerGets) {
                    var prev = node.PreviousFields,
                        fin = node.FinalFields;

                    if (typeof prev.TakerPays === "object") {

                        if (prev.TakerPays.currency === "USD" && prev.TakerPays.issuer === "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" && typeof prev.TakerGets !== "object") {

                            console.log(JSON.stringify(node));

                            var exchange_rate = 1000000 * Amount.from_quality(fin.BookDirectory).to_json().value;

                            if (ledger_index < stats.open_index) {
                                stats.open_index = ledger_index;
                                stats.open = exchange_rate;
                            }

                            if (ledger_index > stats.close_index) {
                                stats.close_index = ledger_index;
                                stats.close = exchange_rate;
                            }

                            stats.bitstampUSD_traded += (prev.TakerPays.value - fin.TakerPays.value);
                            stats.xrp_traded += (prev.TakerGets - fin.TakerGets) / 1000000;

                            if (exchange_rate > stats.high)
                                stats.high = exchange_rate;

                            if (exchange_rate < stats.low)
                                stats.low = exchange_rate;

                            compareToCouch(stats);
                        }
                    } else {
                        // TakerPays is XRP

                        if (prev.TakerGets.currency === "USD" && prev.TakerGets.issuer === "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B" && typeof prev.TakerPays !== "object") {

                            console.log(JSON.stringify(node));

                            var exchange_rate = 1000000 / Amount.from_quality(fin.BookDirectory).to_json().value;

                            if (ledger_index < stats.open_index) {
                                stats.open_index = ledger_index;
                                stats.open = exchange_rate;
                            }

                            if (ledger_index > stats.close_index) {
                                stats.close_index = ledger_index;
                                stats.close = exchange_rate;
                            }

                            stats.bitstampUSD_traded += (prev.TakerGets.value - fin.TakerGets.value);
                            stats.xrp_traded += (prev.TakerPays - fin.TakerPays) / 1000000;

                            if (exchange_rate > stats.high)
                                stats.high = exchange_rate;

                            if (exchange_rate < stats.low)
                                stats.low = exchange_rate;

                            compareToCouch(stats);
                            // console.log("\nstats is now: " + JSON.stringify(stats) + "\n");
                        }
                    }
                }
            });
        }
    }