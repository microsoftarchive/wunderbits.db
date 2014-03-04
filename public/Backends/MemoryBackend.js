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

  var isTruncating = false;
  var cache, storeFieldMap, dbDeferred, infoLog, localStorageAvailable;

  function connect (options) {

    infoLog = options.infoLog;
    localStorageAvailable = options.localStorageAvailable;

    // On every version change, clear out the localStorage & try again for a better backend
    if (localStorageAvailable) {
      var store = global.localStorage;
      var indexedDB = global.indexedDB || global.webkitIndexedDB || global.mozIndexedDB || global.msIndexedDB;
      if (store.getItem('availableBackend') === 'memory' && store.getItem('dbVersion') !== '' + options.version) {
        // clear localStorage
        store.clear();
        // If IDB is available, clear that too
        if(indexedDB) {
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

    dbDeferred = new WBDeferred();

    storeFieldMap = options.stores;

    !cache && reset();
    dbDeferred.resolve();

    infoLog('db ready');

    return dbDeferred.promise();
  }

  function read (storeName, json, options) {

    dbDeferred.then(function() {

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
          (typeof options.success === 'function') && options.success(val);
        }
        else {
          (typeof options.error === 'function') && options.error(val);
        }
      }, 50);
    });
  }

  function query (storeName, options) {

    dbDeferred.then(function() {

      options.success(toArray(cache[storeName]));
    });
  }

  function update (storeName, json, options) {

    if (isTruncating) {
      return;
    }

    dbDeferred.then(function () {

      var meta = storeFieldMap[storeName];

      if (localStorageAvailable && meta.critical) {
        var id = json[meta.keyPath] || json.id;
        global.localStorage[storeName + '_' + id] = JSON.stringify(json);
      }
      else {
        cache[storeName][json.id] = json;
      }

      options.success();
    });
  }

  function destroy (storeName, json, options) {

    dbDeferred.then(function() {

      options.success(delete cache[storeName][json.id]);
    });
  }

  function reset () {

    cache = {};
    forEach(storeFieldMap, function(metaData, storeName) {

      cache[storeName] = {};
    });
  }

  function truncate (callback) {

    isTruncating = true;

    reset();
    localStorageAvailable && global.localStorage.clear();

    isTruncating = false;

    setTimeout(function () {

      (typeof callback === 'function') && callback();
      self.trigger('truncated');
    }, 50);

    return (new WBDeferred()).resolve();
  }

  var MemoryBackend = WBEventEmitter.extend({
    'connect': connect,
    'truncate': truncate,
    'read': read,
    'query': query,
    'update': update,
    'destroy': destroy
  });

  var self = new MemoryBackend();
  return self;

});