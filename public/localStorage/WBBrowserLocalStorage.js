'use strict';

var core = require('wunderbits.core');
var WBClass = core.WBClass;
var WBDeferred = core.WBDeferred;

var localStorage;
try {
  localStorage = global.localStorage;
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
    localStorage.removeItem(key);
    return deferred.resolve().promise();
  },

  'clear': function () {

    var deferred = new WBDeferred();
    localStorage.clear();
    return deferred.resolve().promise();
  }
});

module.exports = WBBrowserLocalStorage;
