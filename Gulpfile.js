'use strict';

var gulp = require('gulp');
var cjs = require('gulp-cjs');

var excludes = [
  //'wunderbits.core',
  'levelup',
  'leveldown'
];

// load tasks
gulp.task('scripts', cjs.scripts(gulp, {
  'sourceDir': 'public',
  'destDir': 'dist',
  'name': 'wunderbits.db',
  'excludes': excludes
}));

gulp.task('server', cjs.server(gulp, {
  'port': 5010,
  'baseDir': process.cwd(),
  'files': require('./karma/files')
}));

gulp.task('tests', cjs.tests(gulp, {
  'name': 'tests',
  'pattern': 'tests/**/*.spec.js',
  'baseDir': process.cwd(),
  'destDir': 'build',
  'excludes': excludes
}));

gulp.task('watch', function () {
  gulp.watch([
    'tests/**/*.spec.js',
    'public/**/*.js'
  ], ['tests']);
});
