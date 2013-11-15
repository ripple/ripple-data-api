function(keys, values, rereduce) {
    if (!rereduce) {

        // key [account, year, month, day, hour, minute, second]
        // value balance

        var most_recent = keys[a][0].slice(1),
            acct_balance = values[0];

        for (var a = 0, num_keys = keys.length; a < num_keys; a++) {
            var timestamp = keys[a][0].slice(1);

            if (lessThan(most_recent, timestamp)) {
                most_recent = timestamp;
                acct_balance = values[a];
            }
        }

        return [acct_balance].concat(most_recent);

    } else {

        var most_recent = values[0][0].slice(1),
            acct_balance = values[0][0];

        for (var a = 0, num_vals = values.length; a < num_vals; a++) {
            var timestamp = values[a][0].slice(1);

            if (lessThan(most_recent, timestamp)) {
                most_recent = timestamp;
                acct_balance = values[a][0];
            }
        }

        return [acct_balance].concat(most_recent);

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