'use strict';

var ENV = process.env;

var SupportedBrowsers = require('./browsers');
var Files = require('./files');

var BrowsersToTest = ENV.TRAVIS ? Object.keys(SupportedBrowsers) : [
  // 'Safari',
  // 'Firefox',
  'Chrome'
];

module.exports = function (config) {

  //ENV.TRAVIS ? config.LOG_ERROR : config.LOG_INFO;
  var LogLevel = config.LOG_INFO;

  config.set({
    'basePath': '',
    'frameworks': [
      'mocha'
    ],
    'files': Files,
    'reporters': ['dots'],
    'captureTimeout': 60000,
    'port': 9876,
    'colors': true,
    'logLevel': LogLevel,
    'autoWatch': false,
    'browserStack': {
      'username': ENV.BROWSER_STACK_USERNAME,
      'accessKey': ENV.BROWSER_STACK_ACCESS_KEY
    },
    'customLaunchers': SupportedBrowsers,
    'browsers': BrowsersToTest,
    'singleRun': true
  });
};
