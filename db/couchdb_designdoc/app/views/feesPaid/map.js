function (doc) {
    var time = new Date(doc.close_time_timestamp),
        timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(), 
                     time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];

    for (var t = 0, txs = doc.transactions.length; t < txs; t++) {
        if (doc.transactions[t].metaData.TransactionResult !== "tesSUCCESS") 
            continue;
        emit(timestamp, parseInt(doc.transactions[t].Fee, 10));
    }
}