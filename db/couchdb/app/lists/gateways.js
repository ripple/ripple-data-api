function(head, req) {
    var view = req.path.slice(2 + req.path.indexOf("_list"))[0];
    if (view === "trustlineStatsByAccount" || view === "trustlineStatsByCurrency") {

        var row;
        while (row = getRow()) {
            if (row.value.incoming > 50 
                && row.value.balance_change < 0) {
                send(JSON.stringify(row) + "\n");
            }
        }

    } else {
        send('Error, this view can only be used with the views "trustlineStatsByCurrency" and "trustlineStatsByAccount"');
    }
}