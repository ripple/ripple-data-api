/*
 * Indexer:  This module connects to couchDB and queries every view so
 * that couchDB will update the index to add the new ledgers.
 * 
 */
function Indexer () {

  var _   = require('lodash'),
  winston = require('winston'),
  async   = require('async');

  var env    = process.env.NODE_ENV || "development",
    DBconfig = require('../db.config.json')[env],
    nano     = require('nano')(DBconfig.protocol+
      '://' + DBconfig.username + 
      ':'   + DBconfig.password + 
      '@'   + DBconfig.host + 
      ':'   + DBconfig.port),
    db = nano.use(DBconfig.database),
    DEBUG;   
      
  if (process.argv.indexOf('debug3') !== -1) DEBUG = 3;
  if (process.argv.indexOf('debug2') !== -1) DEBUG = 2;
  if (process.argv.indexOf('debug1') !== -1) DEBUG = 1;
  if (process.argv.indexOf('debug')  !== -1) DEBUG = 1;

 /**
  *  pingCouchDB gets all of the design docs
  *  and queries one view per design doc to trigger
  *  couchdb's indexer process
  */
  this.pingCouchDB = function() {
    
    // list design docs
    db.list({ startkey:'_design/', endkey:'_e' }, function(err, res){
      if (err) return winston.error('problem getting design docs: ' + err);
     
  
      var designDocIds = _.map(res.rows, function(row){ return row.key; });
  
      // get design docs
      db.fetch({keys: designDocIds}, function(err, res){
              
        async.each(res.rows, function(row, asyncCallback){
  
          if (!row.key || !row.doc) return asyncCallback(null, null);      
  
          var ddoc = row.key.slice(8),
            view   = Object.keys(row.doc.views)[0];
  
          // query one view per design doc
          db.view(ddoc, view, { limit:1, stale:'update_after'}, function(err, res){
            if (err) return asyncCallback(err); 
            
            //display which views are being indexed
            if (DEBUG>1) {
              nano.request({path: '_active_tasks'}, function(err, res){
                if (err) return asyncCallback(err);
        
                res.forEach(function(process){
                  if (process.design_document === '_design/' + ddoc) {
                    winston.info('triggered update of _design/' + ddoc);
                  }
                });
        
                asyncCallback(null, null);
              });
            }                
          });
  
        }, 
        function(err) { if (err) return winston.error(err); });
        
      });
    });  
  }
  return this; 
}

module.exports = Indexer();