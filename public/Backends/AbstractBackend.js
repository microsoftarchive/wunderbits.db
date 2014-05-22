'use strict';

var core = require('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var WBDeferred = core.WBDeferred;
var toArray = core.lib.toArray;
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

    self.transactionQueue = {};
    self.isFlushingTransactionQueue = {};
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

  'flushNextTransactions': function (storeName, transaction) {

    var self = this;
    var queue = self.transactionQueue[storeName];
    var allDone = [];
    var limit = 100;

    if (queue.length) {
      self.isFlushingTransactionQueue[storeName] = true;

      var nextInLine = queue.splice(0, limit);

      nextInLine.forEach(function (operation) {

        var promise = operation(transaction);
        allDone.push(promise);
      });

      when(allDone).always(function nextDone (transaction) {

        var args = toArray(arguments);
        var lastArg = args[args.length - 1];
        transaction = lastArg && lastArg[1];

        if (queue.length) {
          self.flushNextTransactions(storeName, transaction);
        }
        else {
          self.isFlushingTransactionQueue[storeName] = false;
        }
      });
    }
  },

  'flushTransactionQueue': function (storeName) {

    var self = this;

    var queue = self.transactionQueue[storeName];
    var length = queue.length;
    var flushing = self.isFlushingTransactionQueue[storeName];

    if (length && !flushing) {
      self.flushNextTransactions(storeName);
    }
    else if (!length) {
      self.isFlushingTransactionQueue[storeName] = false;
    }
  },

  'queueTransactionOperation': function (storeName, transactionFunction) {

    var self = this;

    var queue = self.transactionQueue[storeName];
    if (!queue) {
      queue = self.transactionQueue[storeName] = [];
    }
    queue.push(transactionFunction);

    !self.isFlushingTransactionQueue[storeName] && self.flushTransactionQueue(storeName);
  },

});

module.exports = AbstractBackend;
