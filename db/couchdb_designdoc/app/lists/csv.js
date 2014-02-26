function(head, req) {
    var row;
    while (row = getRow()) {
        var row_array = [];

        if (typeof row.key === "object") {
            var key = JSON.parse(row.key);
            Object.keys(key).forEach(function(k) {
                row_array.push(JSON.stringify(key[k]));
            });
        } else if (typeof row.key !== "null" || typeof row.key !== "undefined") {
            row_array.push(row.key);
        }

        if (typeof row.value === "object") {
            var value = JSON.parse(row.value);
            Object.keys(value).forEach(function(k) {
                row_array.push(JSON.stringify(value[k]));
            });
        } else if (typeof row.value !== "null" || typeof row.value !== "undefined") {
            row_array.push(row.value);
        }

        var csv_row = row_array.join(',') + "\n";
        send(csv_row);
    }
}