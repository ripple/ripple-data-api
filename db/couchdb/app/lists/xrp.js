function(head, req) {
    var view = req.path.slice(2 + req.path.indexOf("_list"))[0];
    if (view === "xrp_totals") {
        if (req.query.group_level === "1") {

            var total_only = false;
            if (req.query.total_only)
                total_only = true;

            var xrp_total = 0;
            var row;
            while (row = getRow()) {
                xrp_total += row.value[0];
                if (!total_only)
                    send(JSON.stringify([row.key[0], row.value[0]]));
            }
            if (total_only)
                send("XRP Total: " + (xrp_total / 1000000.0));

        } else {
            send('Error, this view should be used with query group_level=1');
        }
    } else {
        send('Error, this view can only be used with the view "xrp_totals"');
    }
}