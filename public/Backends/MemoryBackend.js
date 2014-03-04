define([

  'wunderbits/global',
  'wunderbits/helpers/SafeParse',

  'wunderbits/core/WBEventEmitter',
  'wunderbits/core/WBDeferred',

  'wunderbits/core/lib/forEach',
  'wunderbits/core/lib/toArray'

], function (
  global,
  SafeParse,
  WBEventEmitter, WBDeferred,
  forEach, toArray,
  undefined
) {

  'use strict';

  var indexedDB = global.indexedDB ||
                  global.webkitIndexedDB ||
                  global.mozIndexedDB ||
                  global.msIndexedDB;
  var cache, storeFieldMap, infoLog, localStorageAvailable;

  function connect (options) {

    infoLog = options.infoLog;
    localStorageAvailable = options.localStorageAvailable;

    // On every version change,
    // clear out the localStorage &
    // try again for a better backend
    if (localStorageAvailable) {
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

    storeFieldMap = options.stores;

    !cache && reset();
    infoLog('db ready');

    self.ready.resolve();
  }

  function read (storeName, json) {

    var deferred = new WBDeferred();

    var val;
    var meta = storeFieldMap[storeName];

    if (localStorageAvailable && meta.critical) {
      var id = json[meta.keyPath] || json.id;
      val = global.localStorage[storeName + '_' + id];
      val && (val = SafeParse.json(val));
    }
    else {
      val = cache[storeName][json.id];
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
  }

  function query (storeName) {

    var deferred = new WBDeferred();
    var results = toArray(cache[storeName]);
    return deferred.resolve(results).promise();
  }

  function update (storeName, json) {

    var deferred = new WBDeferred();

    var meta = storeFieldMap[storeName];

    if (localStorageAvailable && meta.critical) {
      var id = json[meta.keyPath] || json.id;
      global.localStorage[storeName + '_' + id] = JSON.stringify(json);
    }
    else {
      cache[storeName][json.id] = json;
    }

    return deferred.resolve().promise();
  }

  function destroy (storeName, json) {

    var deferred = new WBDeferred();
    delete cache[storeName][json.id];
    return deferred.resolve().promise();
  }

  function reset () {

    cache = {};
    forEach(storeFieldMap, function (metaData, storeName) {

      cache[storeName] = {};
    });
  }

  function truncate (callback) {

    var deferred = new WBDeferred();
    self.ready = new WBDeferred();

    reset();
    localStorageAvailable && global.localStorage.clear();

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
  }

  var MemoryBackend = WBEventEmitter.extend({

    'initialize': function () {

      var self = this;
      self.ready = new WBDeferred();
    },

    'connect': function (options) {

      var self = this;
      self.stores = options.stores;
      connect(options);
      return self.ready.promise();
    },

    'truncate': truncate,
    'read': read,
    'query': query,
    'update': update,
    'destroy': destroy
  });

  var self = new MemoryBackend();
  return self;

});