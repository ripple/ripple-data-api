function(head, req) {
    var view = req.path.slice(2 + req.path.indexOf("_list"))[0];
    if (view === "eventsByAccount") {

        var stream = false;
        if (req.query.stream || req.query.include_stats)
            stream = true;

        var constituents = {
            "users": [],
            "gateways": [],
            // "hot_wallets": [],
            "market_makers": [],
            "merchants": []
        };
        var row;
        while (row = getRow()) {
            var acct = row.key[0];

            if (row.value.TrustSet > 100) {
                // gateway
                if (!stream) {
                    constituents.gateways.push(acct);
                } else {
                    send({type: "gateway", acct: acct, stats: row.value});
                }
            // } else if (row.value.Payment > 200 && row.value.TrustSet < 100){
            //     // hot wallet
            //     if (!stream) {
            //         constituents.hot_wallets.push(acct);
            //     } else {
            //         send({type: "hot_wallet", acct: acct, stats: row.value});
            //     }
            } else if (row.value.OfferCreate + row.value.OfferCancel > 100) {
                // market maker
                if (!stream) {
                    constituents.market_makers.push(acct);
                } else {
                    send({type: "market_maker", acct: acct, stats: row.value});
                }
            } else if (row.value.Incoming_Payment > 200) {
                // merchant
                if (!stream) {
                    constituents.merchants.push(acct);
                } else {
                    send({type: "merchant", acct: acct, stats: row.value});
                }
            } else {
                // other
                if (!stream) {
                    constituents.users.push(acct);
                } else {
                    send({type: "user", acct: acct, stats: row.value});
                }
            }
        }
        if (!stream)
            send(JSON.stringify(constituents));
    } else {
        send('Error, this view can only be used with the view "eventsByAccount"');
    }
}