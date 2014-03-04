define([

  './Backends/MemoryBackend',
  './Backends/WebSQLBackend',
  './Backends/IndexedDBBackend',

  'wunderbits/global',
  'wunderbits/helpers/console',

  'wunderbits/core/WBEventEmitter',
  'wunderbits/core/WBDeferred',

  'wunderbits/core/lib/assert',
  'wunderbits/core/lib/size',
  'wunderbits/core/lib/extend',
  'wunderbits/core/lib/clone'

], function (
  MemoryBackend, WebSQLBackend, IndexedDBBackend,
  global, console,
  WBEventEmitter, WBDeferred,
  assert, size, extend, clone,
  undefined
) {

  'use strict';

  var chrome = global.chrome;
  var isChromeApp = !!(chrome && chrome.app && chrome.app.runtime);
  var localStorageAvailable = true;

  // tests for storage engine availability
  var backendTests = {
    'websql': [
      'openDatabase'
    ],
    'indexeddb': [
      'indexedDB',
      'webkitIndexedDB',
      'mozIndexedDB',
      'msIndexedDB'
    ]
  };

  var backends = {
    'memory': MemoryBackend,
    'websql': WebSQLBackend,
    'indexeddb': IndexedDBBackend
  };

  return WBEventEmitter.extend({

    'crud': {},

    'initialize': function (options) {

      var self = this;
      options = options || {};
      self.ready = new WBDeferred();

      assert.object(options.schema);

      var schema = options.schema;
      self.stores = schema.stores;
      self.name = schema.database.name;
      self.version = schema.database.version;
    },

    'init': function (backendName) {

      var self = this;

      // Initialize only once
      var ready = self.ready;
      if (ready.state() === 'resolved') {
        return ready.promise();
      }

      backendName = self.findAvailableBackend(backendName);
      self.backendName = backendName;

      var loggers = self.initLogger(backendName.toUpperCase());
      var stores = self.stores;

      // try to init the available backend
      self.initBackend(backendName, {
        'name': self.name,
        'version': self.version + (size(stores) / 100),
        'stores': stores,
        'infoLog': loggers.info,
        'errorLog': loggers.error,
        'localStorageAvailable': localStorageAvailable
      });

      return ready.promise();
    },

    'currentBackend': function () {
      var self = this;
      return self.backendName;
    },

    // Define the loggers
    'initLogger': function (label) {
      return {
        'info': console.info.bind(console, '[' + label + ']'),
        'error': console.error.bind(console, '[' + label + ']')
      };
    },

    'initBackend': function  (backend, options) {

      var self = this;

      self.backend = backend = backends[backend];
      self.options = options;

      backend.connect(options)
        .done(self.initSuccess, self)
        .fail(self.initFailure, self);
    },

    'initSuccess': function () {

      var self = this;
      var backend = self.backend;

      // export crud functions
      extend(self.crud, {
        'create': backend.update,
        'read':   backend.read,
        'update': backend.update,
        'delete': backend.destroy,
        'query':  backend.query
      });

      // announce once backend is ready
      self.ready.resolve();
      self.publish('ready', {
        'stores': self.stores
      });
    },

    'initFailure': function () {

      var self = this;
      // announce db failure
      self.ready.reject();
    },

    // Test for available storage-backends
    'findAvailableBackend': function (requestedBackend) {

      // Force IndexedDB on packaged-app
      if (isChromeApp) {
        return 'indexeddb';
      }

      // way to force a specific backend on init (used by tests)
      if (requestedBackend in backendTests) {
        return requestedBackend;
      }

      // IF this check has been run previously, load from localStorage
      // But, don't break the app if local storage is not available (disabled by the user)!
      try {
        // throws exception in chrome when cookies are disabled
        var availableBackend = global.localStorage.getItem('availableBackend');
        if (availableBackend in backendTests) {
          return availableBackend;
        }
      }
      catch (e) {
        // If localStorage lookup fails, we probably have no storage at all
        // Use memory
        localStorageAvailable = false;
        return 'memory';
        //document.write('HTML5 local storage (controlled by your cookie settings) is required in order use wunderlist.');
      }

      // Test for available storage options, but use memory backend for tests
      var available;
      for (var name in backendTests) {
        var tests = clone(backendTests[name]);
        while (tests.length && !available) {
          if (!!global[tests.shift()]) {
            available = name;
            break;
          }
        }
      }

      // If none-available, use in-memory as default
      return available || 'memory';
    },

    // Define getAll for the app to load all data in the beginning
    'getAll': function (storeName, callback) {

      var self = this;
      self.ready.done(function () {

        self.backend.query(storeName, {
          'success': callback
        });
      });
    },

    // Empty the database, but don't destroy the structure
    'truncate': function (callback) {

      var self = this;
      self.ready.done(function () {

        // clear out localstorage as well (in case anything ever was left there)
        if (self.backendName !== 'memory' && !isChromeApp) {
          localStorageAvailable && global.localStorage.clear();
        }

        self.backend.truncate(callback);
      });
    }
  });
});
