'use strict';

var core = require('wunderbits.core');
var WBDeferred = core.WBDeferred;
var toArray = core.lib.toArray;

var AbstractBackend = require('./AbstractBackend');

var DOMError = global.DOMError || global.DOMException;
var indexedDB = global.indexedDB ||
                global.webkitIndexedDB ||
                global.mozIndexedDB ||
                global.msIndexedDB;

var Constants = {
  'READ': 'readonly',
  'WRITE': 'readwrite'
};

var Errors = {
  'privateMode': 'ERR_IDB_FIREFOX_PRIVATE_MODE',
  'downgrade': 'ERR_IDB_CANT_DOWNGRADE_VERSION',
  'unknown': 'ERR_IDB_UNKNOWN',
  'upgradeBrowser': 'ERR_IDB_UPGRADE_BROWSER',
  'storeCreationFailed': 'ERR_IDB_STORE_CREATION_FAILED',
  'storeClearFailed': 'ERR_IDB_STORE_CLEAR_FAILED',
  'notFound': 'ERR_IDB_OBJECT_NOT_FOUND',
  'getFailed': 'ERR_IDB_STORE_GET_FAILED',
  'cursorFailed': 'ERR_IDB_CANT_OPEN_CURSOR',
  'queryFailed': 'ERR_IDB_QUERY_FAILED',
  'updateFailed': 'ERR_IDB_STORE_UPDATE_FAILED',
  'destroyFailed': 'ERR_IDB_STORE_DESTROY_FAILED'
};

var IndexedDBBackend = AbstractBackend.extend({

  'transactionQueue': {},

  'isFlushingTransactionQueue': {},

  'flushNextTransactions': function (storeName, transaction) {

    var self = this;
    var queue = self.transactionQueue[storeName];
    var limit = 5;
    var next;

    if (queue.length) {
      self.isFlushingTransactionQueue[storeName] = true;

      var nextInLine = queue.slice(0, limit);

      nextInLine.forEach(function (operation) {

        var promise = operation(transaction)
      });

      self.when(nextInLine).always(function nextDone (transaction) {

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

  'openDB': function (name, version) {

    var self = this;

    var openRequest = indexedDB.open(name, version);
    openRequest.onerror = self.onRequestError.bind(self);
    openRequest.onsuccess = self.onRequestSuccess.bind(self);
    openRequest.onupgradeneeded = self.onUpgradeNeeded.bind(self);
  },

  'onRequestError': function (event) {

    var self = this;
    var error = event.target.error;
    var errorName = error.name;
    var isDOMError = (error instanceof DOMError);

    if (errorName === 'InvalidStateError' && isDOMError) {
      self.openFailure(Errors.privateMode);
    }
    else if (errorName === 'VersionError' && isDOMError) {
      self.openFailure(Errors.downgrade);
    }
    else {
      self.openFailure(Errors.unknown, error);
    }
  },

  'onRequestSuccess': function (event) {

    var self = this;

    if (self.db) {
      self.openSuccess();
      return;
    }

    var db = event.target.result;
    if (typeof db.version === 'string') {
      self.openFailure(Errors.upgradeBrowser);
      return;
    }

    self.db = db;
    self.storeNames = db.objectStoreNames;
    self.openSuccess();
  },

  'onUpgradeNeeded': function (event) {

    var self = this;
    var db = event.target.result;
    self.db = db;
    self.storeNames = db.objectStoreNames;

    self.trigger('upgrading');

    self.mapStores(self.createStore);
  },

  'createStore': function (storeName, storeInfo) {

    var self = this;
    var db = self.db;

    // create store, only if doesn't already exist
    if (!self.storeNames.contains(storeName)) {
      var request = db.createObjectStore(storeName, {
        'keyPath': storeInfo.keyPath || self.defaultKeyPath
      });

      request.onerror = function (error) {
        self.trigger('error', Errors.storeCreationFailed, error, storeName);
      };
    }
  },

  'clearStore': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.WRITE);
    var store = transaction.objectStore(storeName);

    var request = store.clear();

    request.onsuccess = function () {
      deferred.resolve();
    };

    request.onerror = function (error) {
      self.trigger('error', Errors.storeClearFailed, error, storeName);
      deferred.reject();
    };

    return deferred.promise();
  },

  'read': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.READ);
    var store = transaction.objectStore(storeName);
    var id = json[store.keyPath || self.defaultKeyPath] || json.id;

    var request = store.get(id);

    request.onsuccess = function (event) {
      var json = event.target.result;
      if (json) {
        deferred.resolve(json);
      }
      else {
        self.trigger('error', Errors.notFound, null, storeName, json);
        deferred.reject();
      }
    };

    request.onerror = function (error) {
      self.trigger('error', Errors.getFailed, error, storeName, json);
      deferred.reject();
    };

    return deferred.promise();
  },

  'query': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var transaction = self.db.transaction([storeName], Constants.READ);
    var store = transaction.objectStore(storeName);
    var elements = [];

    var readCursor = store.openCursor();

    if (!readCursor) {
      self.trigger('error', Errors.cursorFailed, null, storeName);
      deferred.reject();
    }
    else {
      readCursor.onerror = function (error) {
        self.trigger('error', Errors.queryFailed, error, storeName);
        deferred.reject();
      };

      readCursor.onsuccess = function (e) {

        var cursor = e.target.result;
        // We're done. No more elements.
        if (!cursor) {
          deferred.resolve(elements);
        }
        // We have more records to process
        else {
          elements.push(cursor.value);
          cursor['continue']();
        }
      };
    }

    return deferred.promise();
  },

  'getWriteTransaction': function (storeName) {

    var self = this;
    return self.db.transaction([storeName], Constants.WRITE);
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();
    var promise = deferred.promise();

    self.queueTransactionOperation(storeName, function updateTransaction (storeTransaction) {

      var transaction = storeTransaction ? storeTransaction : self.getWriteTransaction(storeName);
      var store = transaction.objectStore(storeName);

      var request = store.put(json);

      request.onsuccess = function () {
        // pass transaction as second argument as to not resolve db request with wrong data
        deferred.resolve(undefined, transaction);
      };

      request.onerror = function (error) {
        self.trigger('error', Errors.updateFailed, error, storeName, json);
        deferred.reject();
      };

      return promise;
    });

    return promise;
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();
    var promise = deferred.promise();

    self.queueTransactionOperation(storeName, function destroyTransaction (storeTransaction) {

      var transaction = storeTransaction ? storeTransaction : self.getWriteTransaction(storeName);
      var store = transaction.objectStore(storeName);
      var id = json[store.keyPath || self.defaultKeyPath] || json.id;

      var request = store['delete'](id);

      request.onsuccess = function () {
        deferred.resolve(undefined, transaction);
      };

      request.onerror = function (error) {
        self.trigger('error', Errors.destroyFailed, error, storeName, json);
        deferred.reject();
      };

      return promise;
    });

    return promise;
  },

  'nuke': function () {

    var self = this;
    var dbName = self.options.db.name;

    var deferred = new WBDeferred();

    var request = indexedDB.deleteDatabase(dbName);

    request.onsuccess = function () {
      deferred.resolve();
    };

    request.onerror = function () {
      deferred.reject();
    };

    return deferred.promise();
  }
});

module.exports = IndexedDBBackend;
