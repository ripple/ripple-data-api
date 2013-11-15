function(doc) {
    var time = new Date(doc.close_time_timestamp),
        timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(), 
                     time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];

    for (var t = 0, txs = doc.transactions.length; t < txs; t++) {
        var tx = doc.transactions[t];

        if (tx.metaData.TransactionResult !== "tesSUCCESS") 
                continue;

        for (var n = 0, nodes = tx.metaData.AffectedNodes.length; n < nodes; n++) {

            if (tx.metaData.AffectedNodes[n].hasOwnProperty("CreatedNode") && tx.metaData.AffectedNodes[n].CreatedNode.LedgerEntryType === "RippleState") {
                var cnode = tx.metaData.AffectedNodes[n].CreatedNode;

                var currency = cnode.NewFields.Balance.currency,
                    high_party = cnode.NewFields.HighLimit.issuer,
                    low_party = cnode.NewFields.LowLimit.issuer;

                if (parseFloat(cnode.NewFields.Balance.value) !== 0) {
                    emit([high_party, currency, low_party].concat(timestamp), [(0 - parseFloat(cnode.NewFields.Balance.value)), (0 - parseFloat(cnode.NewFields.Balance.value))]);
                    emit([low_party, currency, high_party].concat(timestamp), [parseFloat(cnode.NewFields.Balance.value), parseFloat(cnode.NewFields.Balance.value)]);
                }

            } else if (tx.metaData.AffectedNodes[n].hasOwnProperty("ModifiedNode") && tx.metaData.AffectedNodes[n].ModifiedNode.LedgerEntryType === "RippleState") {
                var mnode = tx.metaData.AffectedNodes[n].ModifiedNode;

                // balance changed
                if (mnode.PreviousFields.hasOwnProperty("Balance")) {

                    var currency = mnode.FinalFields.Balance.currency,
                        low_party = mnode.FinalFields.LowLimit.issuer,
                        high_party = mnode.FinalFields.HighLimit.issuer;

                    var final_bal = parseFloat(mnode.FinalFields.Balance.value),
                        prev_bal = parseFloat(mnode.PreviousFields.Balance.value);

                    emit([low_party, currency, high_party].concat(timestamp), [(final_bal - prev_bal), final_bal]);
                    emit([high_party, currency, low_party].concat(timestamp), [(0 - (final_bal - prev_bal)), (0 - final_bal)]);

                }
            }
        }
    }
}