function (doc) {

    var time = new Date(doc.close_time_timestamp),
        timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(), 
                     time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];

    for (var t = 0, txs = doc.transactions.length; t < txs; t++) {
        var tx = doc.transactions[t];

        if (doc.transactions[t].metaData.TransactionResult !== "tesSUCCESS") 
            continue;

        emit([tx.Account].concat(timestamp), tx);
        if (typeof tx.Destination === "string") {
            emit([tx.Destination].concat(timestamp), tx);
        }
    }
}