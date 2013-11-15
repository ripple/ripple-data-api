function(keys, values, rereduce) {

    if (!rereduce) {


        var first_price = (typeof values[0][2] === "number" ? values[0][2] : (values[0][0] / values[0][1])),
            first_time = keys[0][0].slice(2);

        // initial values
        var stats = {
            open_time: first_time,
            close_time: first_time,

            open: first_price,
            close: first_price,
            high: first_price,
            low: first_price,

            curr1_vwav_numerator: 0,
            curr1_volume: 0,
            curr2_volume: 0,
            num_trades: 0
        };

        // compute stats for this set of values outputted by the map fn
        for (var v = 0, vlen = values.length; v < vlen; v++) {
            var trade = values[v],
                trade_time = keys[v][0].slice(2),
                trade_rate = (typeof trade[2] === "number" ? trade[2] : (trade[0] / trade[1]));

            if (lessThan(trade_time, stats.open_time)) {
                stats.open_time = trade_time;
                stats.open = trade_rate;
            }
            if (lessThan(stats.close_time, trade_time)) {
                stats.close_time = trade_time;
                stats.close = trade_rate;
            }

            stats.high = Math.max(stats.high, trade_rate);
            stats.low = Math.min(stats.low, trade_rate);
            stats.curr1_vwav_numerator += trade_rate * trade[0];
            stats.curr1_volume += trade[0];
            stats.curr2_volume += trade[1];
            stats.num_trades++;
        }

        stats.volume_weighted_avg = stats.curr1_vwav_numerator / stats.curr1_volume;

        return stats;

    } else {

        var stats = values[0];

        // update the stats for each of the segments of results
        for (var v = 1, vlen = values.length; v < vlen; v++) {
            var segment = values[v];

            if (lessThan(segment.open_time, stats.open_time)) {
                stats.open_time = segment.open_time;
                stats.open = segment.open;
            }
            if (lessThan(stats.close_time, segment.close_time)) {
                stats.close_time = segment.close_time;
                stats.close = segment.close;
            }

            stats.high = Math.max(stats.high, segment.high);
            stats.low = Math.min(stats.low, segment.low);

            stats.curr1_vwav_numerator += segment.curr1_vwav_numerator;
            stats.curr1_volume += segment.curr1_volume;
            stats.curr2_volume += segment.curr2_volume;
            stats.num_trades += segment.num_trades;
        }

        stats.volume_weighted_avg = stats.curr1_vwav_numerator / stats.curr1_volume;

        return stats;

    }

    function lessThan(arr1, arr2) {
        if (arr1.length !== arr2.length)
            return false;

        for (var i = 0; i < arr1.length; i++) {
            if (arr1[i] < arr2[i]) {
                return true;
            } else if (arr1[i] > arr2[i]) {
                return false;
            } else {
                continue;
            }
        }

        return false;
    }
}