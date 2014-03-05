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

  var IndexedDBBackend = AbstractBackend.extend({

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
        self.openFailure('ERR_FIREFOX_PRIVATE_MODE');
      }
      else if (errorName === 'VersionError' && isDOMError) {
        self.openFailure('ERR_CANT_DOWNGRADE_VERSION');
      }
      else {
        self.openFailure('ERR_UNKNOWN', error);
      }
    },

    'onRequestSuccess': function (event) {

      var self = this;
      if (self.db) {
        self.openSuccess();
        return;
      }

      var db = event.target.result;
      if (typeof db.version === 'string'){
        self.openFailure('ERR_UPGRADE_BROWSER');
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
        db.createObjectStore(storeName, {
          'keyPath': storeInfo.keyPath || self.defaultKeyPath
        });
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
        self.trigger('error', 'ERR_STORE_CLEAR_FAILED', error, storeName);
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
          self.trigger('error', 'ERR_OBJECT_NOT_FOUND', null, storeName, json);
          deferred.reject();
        }
      };

      request.onerror = function (error) {
        self.trigger('error', 'ERR_STORE_GET_FAILED', error, storeName, json);
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
        self.trigger('error', 'ERR_CANT_OPEN_CURSOR', null, storeName);
        deferred.reject();
      }
      else {
        readCursor.onerror = function (error) {
          self.trigger('error', 'ERR_QUERY_FAILED', error, storeName);
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
        self.trigger('error', 'ERR_STORE_UPDATE_FAILED',
            error, storeName, json);
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
        self.trigger('error', 'ERR_STORE_DESTROY_FAILED',
            error, storeName, json);
        deferred.reject();
      };

      return deferred.promise();
    'nuke': function () {

      var self = this;
      var dbName = self.db.name;

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

  return new IndexedDBBackend();

});