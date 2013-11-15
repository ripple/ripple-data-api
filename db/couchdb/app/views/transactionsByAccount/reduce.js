function(keys, values, rereduce) {

    if (!rereduce) {
        // in this case, this function is being applied to
        // the results of your map function
        // such that keys[0] and values[0] will be what your map function emitted
        // for the first ledger in this set

        var stats = {};

        // reduce functions use return instead of emit
        return stats;
    } else {
        // in this case, this function is being applied to a small batch
        // of results from this very same function
        // this is a little tricky but keys will be null and values
        // will be an array of objects of the form you returned in the !rereduce case

        // I found this blog post to be helpful: http://www.bitsbythepound.com/writing-a-reduce-function-in-couchdb-370.html

        var stats = values[0];

        // compress the other values into a single object

        return stats;
    }

}