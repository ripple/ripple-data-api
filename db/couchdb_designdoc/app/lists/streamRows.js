function(head, req) {
    var row;
    while(row = getRow()){
        send(JSON.stringify([row.key, row.value]) + "\n");
    }
}