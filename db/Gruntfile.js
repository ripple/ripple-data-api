module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('../package.json'),
        "couch-compile": {
            app: {
                // config: {
                //     merge: 'couch/shared'
                // },
                files: {
                    "couchdb_designdoc.json": "couchdb_designdoc/*"
                }
            }
        }
    });

    grunt.loadTasks('../node_modules/grunt-couch/tasks');
    grunt.loadNpmTasks('couch-compile');

    grunt.registerTask('default', ['couch-compile']);

};
