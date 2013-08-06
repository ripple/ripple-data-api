var index = require('./indexes');

module.exports = function(grunt) {


  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jade: {
      index: {
        options: {
          data: {
            issuers: index.issuers,
            pusher: true
          }
        },
        files: {
          "build/index.html": "views/index.jade"
        }
      },
      partials: {
        files: [{
          expand: true,
          cwd: 'views/partials/',
          src: '*.jade',
          dest: 'build/partials/',
          ext: '.html'
        }]
      }
    },
    copy: {
      public: {
        files: [{
          expand: true,
          cwd: 'public/',
          src: ['**'],
          dest: 'build/'
        }]
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jade');
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.registerTask('default', ['jade', 'copy']);
};
