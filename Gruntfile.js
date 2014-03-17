module.exports = function (grunt) {

  'use strict';

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-complexity');
  grunt.loadNpmTasks('grunt-esformatter');
  grunt.loadNpmTasks('kaapi');

  function config (name) {
    return grunt.file.readJSON('grunt/configs/' + name + '.json');
  }

  grunt.initConfig({

    // Linting
    'jshint': config('jshint'),
    'complexity': config('complexity'),

    // specs
    'kaapi/node': config('kaapi'),

    'esformatter': {
      'options': grunt.file.readJSON('.esformatter'),
      'src': [
        'public/**/*.js',
        'specs/**/*.spec.js',
        '!public/wunderbits/core/**/*.js'
      ]
    }

  });

  grunt.registerTask('lint', ['jshint', 'complexity']);

  grunt.registerTask('specs', ['kaapi/node']);

  grunt.registerTask('default', ['lint']);
};