function(keys, values, rereduce) {

    if (!rereduce) {

        var results = {
            change: 0,
            latest_time: keys[0][0].slice(3),
            latest: values[0][1]
        };

        for (var v = 0, vlen = values.length; v < vlen; v++) {
            var time = keys[v][0].slice(3);
            if (lessThan(results.latest_time, time)) {
                results.latest_time = time;
                results.latest = values[v][1];
            }

            results.change += values[v][0];
        }
        return results;

    } else {

        var results = values[0];

        for (var v = 1, vlen = values.length; v < vlen; v++) {
            var segment = values[v];
            if (lessThan(results.latest_time, segment.latest_time)) {
                results.latest_time = segment.latest_time;
                results.latest = segment.latest;
            }
            results += segment.change;
        }

        return results;
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