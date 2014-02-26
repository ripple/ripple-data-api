function(head, req) {
    var view = req.path.slice(2 + req.path.indexOf("_list"))[0];
    if (view === "offersExercised") {
        if (req.query.group === "true") {

            var row;
            while (row = getRow()) {
                var date_arr = row.key.slice(2),
                    price = row.value.volume_weighted_avg,
                    volume = row.value.vwav_denominator;

                var timestamp = pad(date_arr[0],4) + "-" + pad(date_arr[1],2) + "-" + pad(date_arr[2],2) 
                                + "T" + pad(date_arr[3],2) + ":" + pad(date_arr[4],2) + ":" + pad(date_arr[5],2) + "+0000";

                send(JSON.stringify([timestamp, price, volume]) + "\n");
            }
        } else {
            send('Error, this view should be used with query group=true');
        }
    } else {
        send('Error, this view can only be used with the view "offersExercised"');
    }

    function pad (number, digits) {
        var num_str = String(number);
        while (num_str.length < digits) {
            num_str = "0" + num_str;
        }
        return num_str;
    }
}