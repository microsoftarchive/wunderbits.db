'use strict';

var core = require('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var WBDeferred = core.WBDeferred;
var when = core.lib.when;
var assert = core.lib.assert;

var Errors = {
  'init': 'ERR_ABSTRACT_BACKEND_INITIALIZED'
};

var AbstractBackend = WBEventEmitter.extend({

  'defaultKeyPath': 'id',

  'initialize': function () {

    var self = this;

    assert(self.constructor !== AbstractBackend, Errors.init);

    self.ready = new WBDeferred();
  },

  'connect': function (options) {

    var self = this;
    self.options = self.options || {};
    self.options.db = options;
    self.stores = options.stores;
    self.openDB(options.name, options.version, options);
    return self.ready.promise();
  },

  'openSuccess': function () {

    var self = this;
    self.trigger('connected');
    self.ready.resolve();
  },

  'openFailure': function (code, error) {

    var self = this;
    self.trigger('error', code, error);
    self.ready.reject(code, error);
  },

  // helper to loop through stores
  'mapStores': function (iterator) {

    var self = this;
    var results = [];
    var stores = self.stores;
    var storeNames = Object.keys(stores);
    var result, storeName, storeInfo;

    while (storeNames.length) {
      storeName = storeNames.shift();
      storeInfo = stores[storeName];
      result = iterator.call(self, storeName, storeInfo);
      results.push(result);
    }

    return results;
  },

  'truncate': function (callback) {

    var self = this;

    // pause all DB operations
    var deferred = new WBDeferred();
    self.ready = new WBDeferred();

    var storeClearPromises = self.mapStores(self.clearStore);
    when(storeClearPromises).then(function () {

      // kill the db connection for IDB
      self.db && self.db.close && self.db.close()

      // reject all DB operations
      self.ready.reject();
      deferred.resolve();

      // LEGACY: remove this
      if (typeof callback === 'function') {
        callback();
      }

      self.trigger('truncated');
    });

    return deferred.promise();
  },

});

module.exports = AbstractBackend;
