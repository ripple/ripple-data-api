#!/usr/bin/env node

var env    = process.env.NODE_ENV || "development",
  config   = require(process.env.DEPLOYMENT_ENVS_CONFIG || '../deployment.environments.json')[env],
  DBconfig = require(process.env.DB_CONFIG || '../db.config.json')[env],
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

  //compile new docs
  compile(__dirname + "/design", function(err, design) {
    if (err) return winston.error('problem compiling design docs: ' + err);

    // get design docs
    db.fetch({keys: designDocIds}, function(err, res){
      if (err) return winston.error('problem getting design docs: ' + err);
      var docs = res.rows;

      if (!docs.length) winston.info('no exising design docs found');

      var ids = {}, idsu = {}, purge = [], insert = [];
      for (var name in design) ids[design[name]._id] = name;
      for (var name in docs) idsu[docs[name].id] = name;

      docs.forEach(function(doc){
        if (!ids[doc.id]) purge.push({id:doc.id, rev:doc.doc._rev});
      });

      for (var name in design) {
        if (!idsu[design[name]._id]) insert.push(design[name]);
      }

      if (!insert.length) winston.info("no design documents to create");

      insert.forEach(function(doc) {
        db.insert(doc, doc._id, function(err, res) {
          if (err) return winston.error("problem inserting doc: ", doc._id, err);
          winston.info(doc._id + " succesfully inserted");
        });
      });

      if (!purge.length) winston.info("no design documents to remove");

      purge.forEach(function(doc) {
        db.destroy(doc.id, doc.rev, function(err, res){
          if (err) return winston.error('problem removing doc: ', doc.id, err);
          winston.info(doc.id + " sucessfully removed");
        });
      });
    });
  });
});
