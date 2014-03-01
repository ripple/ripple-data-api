module.exports = function(grunt) {
  var update   = grunt.option('update-doc');
  var env      = process.env.NODE_ENV || "development";
  var DBconfig = require('../db.config.json')[env];
  var db       = DBconfig.protocol+
            '://' + DBconfig.host + 
            ':'   + DBconfig.port + 
            '/'   + DBconfig.database;
            
  
  //append "-new" to the doc name if we are updating
  //in order to prevent it from reindexing everything
  
  // Project configuration.
  var config = {
    pkg: grunt.file.readJSON('../package.json'),
    "couch-compile": {
      app: {
        files: {
          "designdoc.json": "design/*"
          
        }
      }
    },
    "couch-push": {   
      options : {
        user : DBconfig.username,
        pass : DBconfig.password, 
      },
      localhost : {
        files : {}
      }
    },
    "deploy-new" : {
    }
  }
    
  config["couch-push"].localhost.files[db] = "designdoc.json";
  
  grunt.initConfig(config);
  grunt.loadTasks('../node_modules/grunt-couch/tasks');
  grunt.registerTask('default', [
    //'couch-compile',
    'couch-compile', 'couch-push'
  ]);

};
