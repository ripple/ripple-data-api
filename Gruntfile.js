module.exports = function(grunt) {
  
//var userConfig = require( './build.config.js' );
  var deploymentEnvironment = process.env.NODE_ENV || "development";
  var deploymentConfig      = require( './deployment.config.js' )(deploymentEnvironment);

  grunt.loadNpmTasks('grunt-npm-install');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-develop');
     
  grunt.initConfig({
    pkg    : grunt.file.readJSON('package.json'),
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
        //env  : { NODE_ENV : 'development'}
      }
    }
  });
  
  grunt.registerTask('default', ['jshint', 'npm-install']);
};