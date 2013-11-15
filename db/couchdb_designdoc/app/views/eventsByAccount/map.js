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
        // var tx_str = JSON.stringify(tx);
        // var matches = tx_str.match(/\"[rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz]{27,53}\"/g);
        // var all_parties = [];
        // matches.forEach(function(rip_addr){
        //     if (all_parties.indexOf(rip_addr))
        //         all_parties.push(rip_addr);
        // });

        // all_parties.forEach(function(rip_addr){
        //     emit([rip_addr].concat(timestamp), tx);
        // });
    }
}