var winston = require('winston'),
    _ = require('lodash'),
    async = require('async');

var config = require('./config');
var db = require('nano')('http://' + config.couchdb_username + ':' + config.couchdb_password + '@ct.ripple.com:5984/rphistory');

db.view("rphistory", "trustlinesByCurrency", {group_level: 2}, function(err, body){
    if (err) {
        winston.info("Error getting trustlinesByCurrency:", err);
        return;
    }

    var trustlines = body.rows;
    trustlines.forEach(function(doc){
        winston.info(doc);
    });
});