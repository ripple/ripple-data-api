module.exports = function(grunt) {
  
//var userConfig = require( './build.config.js' );
  var env               = process.env.NODE_ENV || "development";
  var deploymentConfig  = require('./deployment.config.js')(env);
  var DBconfig          = require('./db.config.json')[env];
  var db = DBconfig.protocol +
    '://' + DBconfig.host  + 
    ':'   + DBconfig.port  + 
    '/'   + DBconfig.database;
    
     
  var gruntConfig = {
    pkg    : grunt.file.readJSON('package.json'),
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
    jshint : {
      files   : [
        'api/**/*.js', 
        //'db/**/*.js', 
        '!db/couchdb_designdoc/**/*.js'
        ],
      options : {
        'validthis': true,
        'laxcomma' : true,
        'laxbreak' : true,
        'browser'  : true,
        'eqnull'   : true,
        'debug'    : true,
        'devel'    : true,
        'boss'     : true,
        'expr'     : true,
        'asi'      : true,
        'sub'      : true
      }
    },
    watch : {
      files   : [
        'api/**/*.js', 
        //'db/**/*.js', 
        'db.config.json', 
        'deployment.environments.json', 
        '!Gruntfile.js'
      ],
      tasks   : ['npm-install', 'jshint', 'develop'],
      options : { spawn: false, atBegin: true }
    },
    develop : {
      server : {
        file : 'api/app.js'
      }
    }
  };
  
  
  gruntConfig["couch-push"].localhost.files[db] = "designdoc.json";
  grunt.initConfig(gruntConfig);
  
  grunt.loadNpmTasks('grunt-npm-install');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-develop');
  grunt.loadTasks('./node_modules/grunt-couch/tasks');
  
  grunt.registerTask('default', ['jshint', 'npm-install', 'couch-compile', 'couch-push']);
};