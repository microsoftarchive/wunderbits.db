'use strict';

var core = require('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var WBDeferred = core.WBDeferred;
var assert = core.lib.assert;
var extend = core.lib.extend;
var clone = core.lib.clone;
var merge = core.lib.merge;

var MemoryBackend = require('./Backends/MemoryBackend');
var WebSQLBackend = require('./Backends/WebSQLBackend');
var IndexedDBBackend = require('./Backends/IndexedDBBackend');

var chrome = global.chrome;
var isChromeApp = !!(chrome && chrome.app && chrome.app.runtime);
var localStorageAvailable = true;

// tests for storage engine availability
var backendTests = {
  'indexeddb': [
    'indexedDB',
    'webkitIndexedDB',
    'mozIndexedDB',
    'msIndexedDB'
  ],
  'websql': [
    'openDatabase'
  ]
};

var backends = {
  'memory': MemoryBackend,
  'websql': WebSQLBackend,
  'indexeddb': IndexedDBBackend
};

var WBDatabase = WBEventEmitter.extend({

  'crud': {},

  'initialize': function (options) {

    var self = this;
    options = options || {};
    self.ready = new WBDeferred();

    assert.object(options.schema);

    var schema = options.schema;
    self.stores = schema.stores;

    var database = schema.database;
    self.name = database.name;

    self.versionless = !!options.versionless;

    // make version change with schema
    var version = (Object.keys(self.stores).length * 10e6);
    version += (parseInt(database.version, 10) || 1);
    self.version = version;
  },

  'init': function (backendName, options) {

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

    options = merge(options || {}, {
      'name': self.name,
      'version': self.version,
      'versionless': self.versionless,
      'stores': stores,
      'infoLog': loggers.info,
      'errorLog': loggers.error,
      'localStorageAvailable': localStorageAvailable
    });

    // try to init the available backend
    self.initBackend(backendName, options);

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

  'initBackend': function (backendName, options) {

    var self = this;
    var BackendClass = backends[backendName];

    var backend = self.backend = new BackendClass();
    self.options = options;

    // pipe backend errors
    backend.on('error', function () {
      console.debug(arguments);
      self.trigger.apply(self, arguments);
    });

    backend.connect(options)
      .done(self.initSuccess, self)
      .fail(self.initFailure, self);
  },

  'initSuccess': function () {

    var self = this;
    var backend = self.backend;

    var crudOps = {
      'create': backend.update,
      'read': backend.read,
      'update': backend.update,
      'delete': backend.destroy,
      'query': backend.query
    };

    // bind crud operations to the backend for context
    // also block all DB operations till db is ready
    Object.keys(crudOps).forEach(function (key) {
      var fn = crudOps[key];
      crudOps[key] = function () {
        var args = arguments;
        var deferred = new WBDeferred();
        var ready = backend.ready;
        ready.done(function () {
          fn.apply(backend, args)
            .done(deferred.resolve, deferred)
            .fail(deferred.reject, deferred);
        });
        ready.fail(deferred.reject, deferred);
        return deferred.promise();
      };
    });

    // export crud functions
    extend(self.crud, crudOps);

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

    // way to force a specific backend on init (used by tests)
    if (requestedBackend in backendTests) {
      return requestedBackend;
    }
    else if (chrome && chrome.storage) {
      return 'indexeddb';
    }

    // IF this check has been run previously, load from localStorage
    // But, don't break the app if local storage is not available
    // (disabled by the user)!
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
      //document.write('HTML5 local storage ' +
      //  '(controlled by your cookie settings) ' +
      //  'is required in order use wunderlist.');
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

      var request = self.backend.query(storeName);
      request.done(callback);
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

      self.backend.truncate().then(callback);
    });
  }
});

module.exports = WBDatabase;
