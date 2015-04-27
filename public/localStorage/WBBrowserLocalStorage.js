'use strict';

var core = require('wunderbits.core');
var WBClass = core.WBClass;
var WBDeferred = core.WBDeferred;

var localStorage;
try {
  localStorage = window.localStorage;
}
catch (e) {
  console.warn(e);
}

var WBBrowserLocalStorage = WBClass.extend({

  'getItem': function (key) {

    var deferred = new WBDeferred();
    var value;

    try {
      value = localStorage.getItem(key);
      deferred.resolve(value);
    }
    catch (e) {
      deferred.reject(e);
    }

    return deferred.promise();
  },

  'setItem': function (key, value) {

    var deferred = new WBDeferred();
    try {
      localStorage.setItem(key, value);
      deferred.resolve();
    }
    catch (e) {
      deferred.reject(e);
    }
    return deferred.promise();
  },

  'removeItem': function (key) {

    var deferred = new WBDeferred();
    try {
      localStorage.removeItem(key);
      deferred.resolve();
    }
    catch (e) {
      deferred.reject(e);
    }

    return deferred.promise();
  },

  'clear': function () {

    var deferred = new WBDeferred();

    try {
      localStorage.clear();
      deferred.resolve();
    }
    catch (e) {
      deferred.reject(e);
    }

    return deferred.promise();
  }
});

module.exports = WBBrowserLocalStorage;
