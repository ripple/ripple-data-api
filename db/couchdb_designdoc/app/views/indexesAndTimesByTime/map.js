function (doc) {
    var time = new Date(doc.close_time_timestamp),
        timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(), 
                     time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];

    var ledger_index = doc.ledger_index;

    emit(timestamp, ledger_index);

}