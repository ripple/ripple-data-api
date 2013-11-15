function(doc) {

    var time = new Date(doc.close_time_timestamp),
        timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(), 
                     time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];

    for (var t = 0, txs = doc.transactions.length; t < txs; t++) {

        if (doc.transactions[t].TransactionType === "Payment" || doc.transactions[t].TransactionType === "OfferCreate") {

            var tx = doc.transactions[t],
                meta = tx.metaData,
                affNodes = meta.AffectedNodes;

            if (meta.TransactionResult !== "tesSUCCESS")
                continue;

            for (var n = 0, num_nodes = affNodes.length; n < num_nodes; n++) {
                var node;

                if (affNodes[n].hasOwnProperty("DeletedNode") && affNodes[n].DeletedNode.LedgerEntryType === "Offer") {
                    node = affNodes[n].DeletedNode;
                } else {
                    continue;
                }

                // TakerPays and TakerGets were modified, meaning the offer was taken
                if (node.PreviousFields.hasOwnProperty("TakerPays") 
                    && node.PreviousFields.hasOwnProperty("TakerGets")) {

                    var pay_curr, pay_amnt_unfunded;
                    var exchange_rate = node.exchange_rate;

                    if (typeof node.PreviousFields.TakerPays === "object") {
                        pay_curr = [node.PreviousFields.TakerPays.currency, node.PreviousFields.TakerPays.issuer];
                        pay_amnt_unfunded = parseFloat(node.FinalFields.TakerPays.value);
                    } else {
                        pay_curr = ["XRP"];
                        pay_amnt_unfunded = parseFloat(node.FinalFields.TakerPays) / 1000000.0; // convert from drops
                        exchange_rate = exchange_rate / 1000000.0;
                    }

                    var get_curr, get_amnt_unfunded;
                    if (typeof node.PreviousFields.TakerGets === "object") {
                        get_curr = [node.PreviousFields.TakerGets.currency, node.PreviousFields.TakerGets.issuer];
                        get_amnt_unfunded = parseFloat(node.FinalFields.TakerGets.value);
                    } else {
                        get_curr = ["XRP"];
                        get_amnt_unfunded = parseFloat(node.FinalFields.TakerGets) / 1000000.0;
                        exchange_rate = exchange_rate * 1000000.0;
                    }

                    emit([pay_curr, get_curr].concat(timestamp), [pay_amnt_unfunded, get_amnt_unfunded, exchange_rate]);
                    emit([get_curr, pay_curr].concat(timestamp), [get_amnt_unfunded, pay_amnt_unfunded, 1 / exchange_rate]);

                }
            }
        }
    }
}