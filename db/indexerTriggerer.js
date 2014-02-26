var winston = require('winston'),
  _ = require('lodash'),
  async = require('async'),
  config = require('./config'),
  nano = require('nano')('http://' + config.couchdb.username + 
    ':' + config.couchdb.password + 
    '@' + config.couchdb.host + 
    ':' + config.couchdb.port),
  db = nano.use(config.couchdb.database);

setInterval(pingCouchDB, 5000);
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

      async.each(res.rows, function(row, asyncCallback){

        if (!row.key || !row.doc) {
          asyncCallback(null, null);
          return
        }

        var ddoc = row.key.slice(8),
          view = Object.keys(row.doc.views)[0];

        // query one view per design doc
        db.view(ddoc, view, { limit:1, stale:'update_after' }, function(err, res){
          if (err) {
            asyncCallback(err);
            return;
          }

          // winston.info('called ' + ddoc + '/' + view);
          nano.request({path: '_active_tasks'}, function(err, res){
            if (err) {
              asyncCallback(err);
              return;
            }

            res.forEach(function(process){
              if (process.design_document === '_design/' + ddoc) {
                winston.info('triggered update of _design/' + ddoc);
              }
            });

            asyncCallback(null, null);
          });


        });

      }, function(err){
        if (err) {
          winston.error(err);
          return;
        }

      });
    });
  });

}