define([

  './AbstractBackend',

  'wunderbits/global',

  'wunderbits/core/WBDeferred'

], function (
  AbstractBackend,
  global,
  WBDeferred,
  undefined
) {

  'use strict';

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

  return AbstractBackend.extend({

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

    'update': function (storeName, json) {

      var self = this;
      var deferred = new WBDeferred();

      var transaction = self.db.transaction([storeName], Constants.WRITE);
      var store = transaction.objectStore(storeName);

      var request = store.put(json);

      request.onsuccess = function () {
        deferred.resolve();
      };

      request.onerror = function (error) {
        self.trigger('error', Errors.updateFailed, error, storeName, json);
        deferred.reject();
      };

      return deferred.promise();
    },

    'destroy': function (storeName, json) {

      var self = this;
      var deferred = new WBDeferred();

      var transaction = self.db.transaction([storeName], Constants.WRITE);
      var store = transaction.objectStore(storeName);
      var id = json[store.keyPath || self.defaultKeyPath] || json.id;

      var request = store['delete'](id);

      request.onsuccess = function () {
        deferred.resolve();
      };

      request.onerror = function (error) {
        self.trigger('error', Errors.destroyFailed, error, storeName, json);
        deferred.reject();
      };

      return deferred.promise();
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
});
