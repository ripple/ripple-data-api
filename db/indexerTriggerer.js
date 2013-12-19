var winston = require('winston'),
  _ = require('lodash'),
  config = require('./config'),
  nano = require('nano')('http://' + config.couchdb.username + 
    ':' + config.couchdb.password + 
    '@' + config.couchdb.host + 
    ':' + config.couchdb.port),
  db = nano.use(config.couchdb.database);

setInterval(pingCouchDB, 30000);
// pingCouchDB();

/**
 *  pingCouchDB gets all of the design docs
 *  and queries one view per design doc to trigger
 *  couchdb's indexer process
 */
function pingCouchDB() {

  // list design docs
  db.list({ startkey:'_design/', endkey:'_e' }, function(err, res){
    if (err) {
      winston.error('problem getting design docs: ' + err);
      return;
    }

    var designDocIds = _.map(res.rows, function(row){ return row.key; });

    // get design docs
    db.fetch({keys: designDocIds}, function(err, res){
      res.rows.forEach(function(row){

        if (!row.key || !row.doc) {
          return;
        }

        var ddoc = row.key.slice(8),
          view = Object.keys(row.doc.views)[0];

        // query one view per design doc
        db.view(ddoc, view, { limit:1, stale:'update_after' }, function(err, res){
          if (err) {
            winston.error('problem pinging ddoc: ' + ddoc + ' view: ' + view + ' err: ' + err);
            return;
          }

          winston.info('called ' + ddoc + '/' + view);
          nano.request({path: '_active_tasks'}, function(err, res){
            if (err) {
              winston.error('problem getting active tasks: ' + err);
              return;
            }

            winston.info('active tasks now: ' + JSON.stringify(res));
          });


        });
      });

    });

  });

}