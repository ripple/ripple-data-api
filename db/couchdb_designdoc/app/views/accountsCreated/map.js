function(doc) {
    var time = new Date(doc.close_time_timestamp),
        timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(), 
                     time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];

    for (var t = 0, txs = doc.transactions.length; t < txs; t++) {
        var tx = doc.transactions[t];

        if (tx.metaData.TransactionResult !== "tesSUCCESS") 
                continue;

        for (var n = 0, nodes = tx.metaData.AffectedNodes.length; n < nodes; n++) {

            if (tx.metaData.AffectedNodes[n].hasOwnProperty("CreatedNode") 
                && tx.metaData.AffectedNodes[n].CreatedNode.LedgerEntryType === "AccountRoot") {
                var cnode = tx.metaData.AffectedNodes[n].CreatedNode;

                emit(timestamp, cnode.NewFields.Account);
            }
        }
    }
}