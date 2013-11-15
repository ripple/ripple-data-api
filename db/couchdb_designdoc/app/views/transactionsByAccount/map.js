function(doc) {
    // doc will be a JSON object of the same form as: http://ct.ripple.com:5984/_utils/document.html?rphist/0003100000

    var key = [];
    var value = {};

    // emit is CouchDB's function that is effectively "return" for map functions
    emit(key, value);
}