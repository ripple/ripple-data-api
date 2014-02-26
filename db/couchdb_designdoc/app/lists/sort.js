function(head, req) {
    var rows = [],
        row;
    while (row = getRow()) {
        rows.push(row);
    }
    rows.sort(function(a, b) {
        if (b.value > a.value) {
            return 1;
        } else {
            return -1;
        }
    });
    send(JSON.stringify({"rows": rows}));
}