function (keys, values, rereduce) {

    if (!rereduce) {

        var types = {
            Payment: 0,
            OfferCreate: 0,
            OfferCancel: 0,
            TrustSet: 0,
            Incoming_Payment: 0
        };
        var total = 0;

        for (var v = 0, vlen = values.length; v < vlen; v++) {
            var tx = values[v];

            if (tx.Account === keys[v][0]) {
                // tx initiated by this account

                if (types.hasOwnProperty(tx.TransactionType)) {
                    types[tx.TransactionType] += 1;
                    total += 1;
                }
            } 
            else if (tx.TransactionType === "Payment" && tx.Destination === keys[v][0]) {
                types[Incoming_Payment] += 1;
            }
        }

        types.Total_Initiated = total;
        return types;

    } else {

        var results = values[0];
        var tx_types = Object.keys(results);

        for (var v = 1, vlen = values.length; v < vlen; v++) {
            for (var t = 0; t < tx_types.length; t++) {
                var tx_type = tx_types[t];
                results[tx_type] += values[v][tx_type];
            }
        }

        return results;
    }
}