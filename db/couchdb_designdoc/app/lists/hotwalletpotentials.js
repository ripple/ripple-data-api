function(head, req) {
    var view = req.path.slice(2 + req.path.indexOf("_list"))[0];

    if (view === "trustlinesByAccount") {
        if (req.query.group_level === 2) {
            var row;
            var potentials;
            while (row = getRow()) {
                if (row.value.outgoing < 5
                    && row.value.balance > 0) {

                    var acct = row.key[0],
                        curr = row.key[1];

                    if (typeof potentials[acct] === "undefined")
                        potentials[acct] = {};
                    if (typeof potentials[acct][curr] === "undefined")
                        potentials[acct][curr] = {};

                    potentials[acct][curr].in = row.value.incoming;
                    potentials[acct][curr].out = row.value.outgoing;
                    potentials[acct][curr].bal = row.value.balance_change;
                    potentials[acct][curr].trusted_parties = row.value.trusted_parties;
                }
            }
            send(JSON.stringify(potentials));
        } else {
            send('Error, this view should be used with query group_level=2');
        }
    } else {
        send('Error, this view can only be used with the view "trustlinesByAccount"');
    }
}