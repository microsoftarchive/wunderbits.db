'use strict';

var core = require('wunderbits.core');
var WBDeferred = core.WBDeferred;
var forEach = core.lib.forEach;
var toArray = core.lib.toArray;

var AbstractBackend = require('./AbstractBackend');
var SafeParse = require('../lib/SafeParse');

var indexedDB = global.indexedDB ||
                global.webkitIndexedDB ||
                global.mozIndexedDB ||
                global.msIndexedDB;

var MemoryBackend = AbstractBackend.extend({

  'cache': {},

  'localStorageAvailable': true,

  'initialize': function () {

    var self = this;
    self.ready = new WBDeferred();
  },

  'connect': function (options) {

    var self = this;
    self.stores = options.stores;

    self.localStorageAvailable = options.localStorageAvailable;

    // On every version change,
    // clear out the localStorage &
    // try again for a better backend
    if (self.localStorageAvailable) {
      var store = global.localStorage;
      if (store.getItem('availableBackend') === 'memory' &&
          store.getItem('dbVersion') !== '' + options.version) {

        // clear localStorage
        store.clear();

        // If IDB is available, clear that too
        if (indexedDB) {
          var transaction = indexedDB.deleteDatabase(options.name);
          // Wait till the database is deleted before reloading the app
          transaction.onsuccess = transaction.onerror = function() {
            global.location.reload();
          };
        }
        // Otherwise, reload right away
        else {
          global.location.reload();
        }
      }
    }

    !self.cache && self.reset();

    self.ready.resolve();
    return self.ready.promise();
  },

  'reset': function () {

    var self = this;
    self.cache = {};
    forEach(self.stores, function (metaData, storeName) {
      self.cache[storeName] = {};
    });
  },

  'truncate': function (callback) {

    var self = this;
    var deferred = new WBDeferred();
    self.ready = new WBDeferred();

    self.reset();
    self.localStorageAvailable && global.localStorage.clear();

    setTimeout(function () {

      // reject all DB operations
      self.ready.reject();
      deferred.resolve();

      // LEGACY: remove this
      if (typeof callback === 'function') {
        callback();
      }

      self.trigger('truncated');
    }, 50);

    return deferred.promise();
  },

  'read': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var val;
    var meta = self.stores[storeName];

    if (self.localStorageAvailable && meta.critical) {
      var id = json[meta.keyPath] || json.id;
      val = global.localStorage[storeName + '_' + id];
      val && (val = SafeParse.json(val));
    }
    else {
      val = self.cache[storeName][json.id];
    }

    setTimeout(function () {

      if (val !== undefined) {
        deferred.resolve(val);
      }
      else {
        deferred.reject();
      }
    }, 50);

    return deferred.promise();
  },

  'query': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();
    var results = toArray(self.cache[storeName]);
    return deferred.resolve(results).promise();
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var meta = self.stores[storeName];

    if (self.localStorageAvailable && meta.critical) {
      var id = json[meta.keyPath] || json.id;
      global.localStorage[storeName + '_' + id] = JSON.stringify(json);
    }
    else {
      self.cache[storeName][json.id] = json;
    }

    return deferred.resolve().promise();
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();
    delete self.cache[storeName][json.id];
    return deferred.resolve().promise();
  }
});

module.exports = MemoryBackend;
