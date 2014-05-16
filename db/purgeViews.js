var env    = process.env.NODE_ENV || "development",
  config   = require('../deployment.environments.json')[env],
  DBconfig = require('../db.config.json')[env],
  db       = require('nano')(DBconfig.protocol+
    '://'  + DBconfig.username + 
    ':'    + DBconfig.password + 
    '@'    + DBconfig.host + 
    ':'    + DBconfig.port + 
    '/'    + DBconfig.database);
    
var _     = require('lodash'),
  winston = require('winston'),
  compile = require('couch-compile');    

db.list({ startkey:'_design/', endkey:'_e' }, function(err, res){
  if (err) return winston.error('problem getting design doc list: ' + err);
 
  var designDocIds = _.map(res.rows, function(row){ return row.key; });

  // get design docs
  db.fetch({keys: designDocIds}, function(err, res){
    if (err) return winston.error('problem getting design docs: ' + err); 
    var docs = res.rows;
    
    if (!docs.length) return winston.info('no exising design docs found');
    
    //compile new docs
    compile("./design", function(err, design) {
      if (err) return winston.error('problem compiling design docs: ' + err); 
      var ids = {}, purge = [];
      for (var name in design) ids[design[name]._id] = name;

      docs.forEach(function(doc){
        if (!ids[doc.id]) purge.push({id:doc.id, rev:doc.doc._rev});
      });
      
      if (!purge.length) return winston.info("no design documents to remove");
      
      purge.forEach(function(doc) {
        db.destroy(doc.id, doc.rev, function(err, res){
          if (err) return winston.error('problem removing doc: ', doc.id, err); 
          winston.info(doc.id+" sucessfully removed");
        });        
      });
    });
  });
});
