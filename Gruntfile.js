module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      files: ['*.js'],
      options: {
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
    watch: {
      files: ['*.js'],
      tasks: ['npm-install', 'jshint', 'develop'],
      options: { spawn: false }
    },
    develop: {
      server: {
        file: 'app.js',
        env: { NODE_ENV: 'development'}
      }
    }
  });

  grunt.loadNpmTasks('grunt-npm-install');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-develop');

  grunt.registerTask('default', ['jshint', 'develop', 'npm-install']);

};