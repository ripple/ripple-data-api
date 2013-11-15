function(keys, values, rereduce) {

    if (!rereduce) {


        var first_price = (typeof values[0][2] === "number" ? values[0][2] : (values[0][0] / values[0][1]));

        // initial values
        var stats = {
            curr1_volume_unfunded: 0,
            curr2_volume_unfunded: 0,
            num_trades: 0
        };

        // compute stats for this set of values outputted by the map fn
        for (var v = 0, vlen = values.length; v < vlen; v++) {
            var trade = values[v];

            stats.curr1_volume_unfunded += trade[0];
            stats.curr2_volume_unfunded += trade[1];
            stats.num_trades++;
        }

        return stats;

    } else {

        var stats = values[0];

        // update the stats for each of the segments of results
        for (var v = 1, vlen = values.length; v < vlen; v++) {
            var segment = values[v];

            stats.curr1_volume_unfunded += segment.curr1_volume_unfunded;
            stats.curr2_volume_unfunded += segment.curr2_volume_unfunded;
            stats.num_trades += segment.num_trades;
        }

        return stats;

    }
}