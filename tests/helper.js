'use strict';

var chai, context;

// if running on a CJS environment
if (typeof require !== 'undefined') {
  // load chai & sinon in the global context
  chai = require('chai');
  global.sinon = require('sinon');
  chai.use(require('sinon-chai'));

  // mock location
  global.location = {
    'protocol': 'http:',
    'host': 'www.wunderlist.com'
  };

  context = global;
}
// otherwise, this must be a browser
else {
  chai = window.chai;
  window.mocha.ui('bdd');
  context = window;
}

// chrome local storage mock
var chromeStorageCache = {};
global.chrome = {
  'runtime': {},
  'storage': {
    'local': {
      'get': function (key, callback) {

        var obj = {};
        obj[key] = chromeStorageCache[key];
        callback(obj);
      },
      'set': function (data, callback) {

        for (var key in data) {
          chromeStorageCache[key] = data[key];
        }

        callback();
      },
      'remove': function (key, callback) {

        delete chromeStorageCache[key];
        callback();
      },
      'clear': function (callback) {

        chromeStorageCache = {};
        callback();
      }
    }
  }
};

// expose bdd helpers from chai
context.expect = chai.expect;
chai.should();
