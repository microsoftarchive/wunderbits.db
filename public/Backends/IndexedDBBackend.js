define([

  'wunderbits/global',

  'wunderbits/core/WBEventEmitter',
  'wunderbits/core/WBDeferred',
  'wunderbits/core/When',

  'wunderbits/core/lib/forEach',
  'wunderbits/core/lib/size'

], function (
  global,
  WBEventEmitter, WBDeferred, when,
  forEach, size,
  undefined
) {

  'use strict';

  var chrome = global.chrome;
  var isChromeApp = !!(chrome && chrome.app && chrome.app.runtime);

  var dbDeferred = new WBDeferred();

  var defaultKeyPath = 'id';
  var isTruncating = false;
  var DB, storeFieldMap, infoLog, errorLog;
  var dbVersion, dbName;
  var migrationData = {};
  var upgrading = false;

  // We are using indexeddb synchronously
  var indexedDB = global.indexedDB || global.webkitIndexedDB || global.mozIndexedDB || global.msIndexedDB;

  var IDBTransactionModes = {
    'read': 'readonly',
    'write': 'readwrite'
  };

  // break the stack & give UI some time to breath
  // IE & FF don't like long running scripts
  function nextTick () {
    var args = [].slice.call(arguments);
    var next = args.shift();
    global.setTimeout(function () {
      next.apply(null, args);
    }, 10);
  }

  // helper to loop through stores
  function mapStores (iterator) {
    var result = [];
    var stores = Object.keys(storeFieldMap);
    forEach(stores, function (storeName, index) {
      result[index] = iterator(storeName, storeFieldMap[storeName]);
    });
    return result;
  }

  // Create Object Store with a keypath
  function createStore (storeName, db) {

    var deferred = new WBDeferred();

    try {
      var createReq = db.createObjectStore(storeName, {
        'keyPath': storeFieldMap[storeName].keyPath || defaultKeyPath
      });
      createReq.onsuccess = function () {
        deferred.resolve();
      };
    }
    catch (e) {
      // can not create stores if they already exist,
      // just resolve this request and move on
      deferred.resolve();
    }

    return deferred.promise();
  }

  function clearStore (storeName) {

    var deferred = new WBDeferred();
    var transaction = DB.transaction([storeName], IDBTransactionModes.write);
    var store = transaction.objectStore(storeName);
    var clearRequest = store.clear();

    clearRequest.onsuccess = function () {
      deferred.resolve();
    };

    clearRequest.onerror = function (e) {
      console.error(e);
      deferred.resolve();
    };

    return deferred.promise();
  }

  // Clear all object stores
  function truncate (callback) {

    isTruncating = true;

    var deferreds = mapStores(clearStore);

    when(deferreds).then(function () {

      isTruncating = false;
      if (typeof callback === 'function') {
        callback();
      }

      self.trigger('truncated');
    });
  }

  function _upgradeNeeded (e) {

    upgrading = true;
    infoLog('upgrade needed');
    self.publish('upgraded');

    var db = e.target.result.db || e.target.result;

    var createDeferreds = mapStores(function (storeName) {
      return createStore(storeName, db);
    });

    when(createDeferreds).then(function () {

      db.close();

      var versionlessDbOpenReq;
      try {
        versionlessDbOpenReq = indexedDB.open(dbName);
        versionlessDbOpenReq.onerror = handleIDBOpenError;
      }
      catch (e) {
        handleIDBOpenError();
        return;
      }

      // Migrate data from older version of the database
      versionlessDbOpenReq.onsuccess = function (e) {

        var _db = e.target.result.db || e.target.result;

        var writeDeferreds = mapStores(function (storeName) {
          return writeMigrations(storeName, _db);
        });

        if (writeDeferreds.length) {
          when(writeDeferreds).then(_dbReady, undefined, _db);
        }
        else {
          _dbReady(_db);
        }
      };

    });
  }

  function _dbReady (db) {

    DB = db;
    infoLog('DB ready');
    // clean this up if no upgraded needed
    migrationData && (migrationData = null);
    global.setTimeout(function () {
      dbDeferred.resolve();
    }, 100);
  }

  function handleIDBOpenError (e) {

    // Scum bag user refused IDB storage or in private mode
    // Force memory mode
    if(!isChromeApp) {
      infoLog('switching to memory', e);
      self.trigger('analytics:db:memoryFallback', 'indexeddb');
      global.localStorage.setItem('availableBackend', 'memory');
      global.localStorage.setItem('dbVersion', '' + dbVersion);
      global.location.reload();
    }
  }

  function readStoreForMigration (storeName, db) {

    infoLog('reading ' + storeName);

    var deferred = new WBDeferred();
    try {
      query(storeName, {
        'db': db,
        'success': function (data) {

          // try catch block, because if upgrade is not needed
          // _dbready will null out the migration data object as it is no longer needed
          // the async read transations will still execute
          try {
            migrationData[storeName] = data;
          }
          catch (e) {
            // infoLog(e);
          }
          deferred.resolve();
        }
      });
    }
    catch (e) {
      infoLog(e);
      deferred.resolve();
    }

    return deferred.promise();
  }

  function writeMigrations (storeName, db) {

    function write (data) {

      var deferred = new WBDeferred();
      update(storeName, data, {
        'db': db,
        'success': function () {
          deferred.resolve();
        },
        'error': function () {
          deferred.resolve();
        }
      });

      return deferred.promise();
    }

    infoLog(storeName, ' migrationData:', typeof migrationData, size(migrationData));
    if (migrationData && migrationData[storeName]) {

      infoLog('writing ' + storeName);

      // WRITE ANY STORED MIGRATION DATAS
      var toMigrate = migrationData[storeName];
      delete migrationData[storeName];
      var writeDeferreds = [];
      forEach(toMigrate, function (data) {
        writeDeferreds.push(write(data));
      });
      return when(writeDeferreds);
    }

    return (new WBDeferred()).resolve();
  }

  function connect (options) {

    storeFieldMap = options.stores;
    infoLog = options.infoLog;
    errorLog = options.errorLog;
    dbVersion = options.version;
    dbName = options.name;

    var promise = dbDeferred.promise();

    // PESUDO MIGRATION - JUST GET AND DUMP EXISTING DATA
    var versionLessDeferred = new WBDeferred();
    // OPEN VERSIONLESS DATABASE TO GET A READABLE TRANSACTION
    var versionlessDbOpenReq;
    try {
      versionlessDbOpenReq = indexedDB.open(dbName);
      versionlessDbOpenReq.onerror = handleIDBOpenError;
    }
    catch (e) {
      handleIDBOpenError();
      return promise;
    }
    // READ ALL EXISTENT DATA
    versionlessDbOpenReq.onsuccess = function (e) {

      var db = e.target.result;

      var readDeferreds = mapStores(function (storeName) {
        return readStoreForMigration(storeName, db);
      });

      when(readDeferreds).then(function () {

        // CLOSE VERSIONLESS DATABASE
        db.close();
        versionLessDeferred.resolve();
      });
    };

    versionLessDeferred.then(function () {
      // OPEN DATABASE WITH VERSION INFO
      // IE10 requires integer, FF requires float, W.T.F.
      var openArgs = [dbName];
      if (indexedDB === global.msIndexedDB) {
        dbVersion = parseInt(dbVersion, 10);
      }
      openArgs.push(dbVersion);

      var dbOpenReq;
      try {
        dbOpenReq = indexedDB.open.apply(indexedDB, openArgs);
        dbOpenReq.onerror = handleIDBOpenError;
      }
      catch (e) {
        handleIDBOpenError();
        return promise;
      }

      dbOpenReq.onsuccess = function (e) {

        var db = e.target.result;
        setTimeout(function () {

          // ie10 fires both upgrade needed and success at the same time,
          // so, if we are performing an upgrade,
          // the upgrade handler should resolve db ready
          if (!upgrading) {
            _dbReady(db);
          }
        }, 50);
      };

      dbOpenReq.onupgradeneeded = _upgradeNeeded;
      dbOpenReq.onblocked = errorLog;

      // Comment back in if FF is memory leaking again
      // WBRuntime.on('window:unload', function() {

      //   dbDeferred.then(function() {

      //     DB.close();
      //   });
      // }, false);

    });

    return promise;
  }


  var errorMsg = 'failed reading from the database';
  function query (storeName, options) {

    var _db = options.db || DB;

    var readTransaction = _db.transaction([storeName], IDBTransactionModes.read);
    //readTransaction.oncomplete = infoLog;
    var store = readTransaction.objectStore(storeName);
    var elements = [];
    var readCursor = store.openCursor();

    if (readCursor === undefined || !readCursor) {

      errorLog(errorMsg);
      options.error(errorMsg);
    }
    else {

      readCursor.onerror = errorLog;
      readCursor.onsuccess = function (e) {

        var cursor = e.target.result;

        if (!cursor) {
          // We're done. No more elements.
          nextTick(options.success, elements);
        }
        else {
          // We have more records to process
          elements.push(cursor.value);
          cursor['continue']();
        }
      };
    }
  }

  function read (storeName, json, options) {

    var _db = options.db || DB;

    var readTransaction = _db.transaction([storeName], IDBTransactionModes.read);
    //readTransaction.oncomplete = infoLog;
    var store = readTransaction.objectStore(storeName);
    var keyPath = store.keyPath || defaultKeyPath;
    var id = json[keyPath] || json.id;
    var getRequest = store.get(id);

    getRequest.onerror = errorLog;
    getRequest.onsuccess = function (e) {

      var json = e.target.result;
      if (json) {
        nextTick(options.success, json);
      }
      else {
        nextTick(options.error, 'object not Found');
      }
    };
  }

  function update (storeName, json, options) {

    var _db = options.db || DB;

    if (isTruncating) {
      return;
    }

    // wrap writes in try catch to handle invalid transaction states
    try {
      var writeTransaction = _db.transaction([storeName], IDBTransactionModes.write);
      var store = writeTransaction.objectStore(storeName);
      var writeRequest = store.put(json);

      writeRequest.onerror = errorLog;
      writeRequest.onsuccess = function () {
        nextTick(options.success);
      };
    }
    catch (e) {
      errorLog(e, json);
    }
  }

  function destroy (storeName, json, options) {

    var writeTransaction = DB.transaction([storeName], IDBTransactionModes.write);
    // writeTransaction.oncomplete = infoLog;
    var store = writeTransaction.objectStore(storeName);
    var keyPath = store.keyPath || defaultKeyPath;
    var id = json[keyPath] || json.id;
    var deleteRequest = store['delete'](id);

    deleteRequest.onerror = errorLog;
    deleteRequest.onsuccess = function () {

      nextTick(options.success);
    };
  }

  var IndexedDBBackend = WBEventEmitter.extend({
    'connect': connect,
    'truncate': truncate,
    'read': read,
    'query': query,
    'update': update,
    'destroy': destroy
  });

  var self = new IndexedDBBackend();
  return self;

});
