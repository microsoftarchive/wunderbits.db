'use strict';

var levelup;
try {
  levelup = require('levelup');
} catch (e) {
  console.warn('leveldb unavailable');
}

var core = require('wunderbits.core');
var WBDeferred = core.WBDeferred;

var AbstractBackend = require('./AbstractBackend');

var LevelDBBackend = AbstractBackend.extend({

  'openDB': function (name) {

    if (!levelup) {
      self.openFailure('ERR_LDB_UNAVAILABLE');
      return;
    }

    var self = this;
    levelup('/tmp/db/' + name, function (err, database) {
      if (err) {
        self.openFailure('ERR_LDB_INIT_FAILED', err);
      } else {
        self.db = database;
        self.openSuccess();
      }
    });
  },

  'clearStore': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    self.db
      .createKeyStream()
      .on('data', function (key) {
        if (key.indexOf(storeName + ':') === 0) {
          self.db.del(key);
        }
      }).on('error', function () {
        deferred.reject();
      }).on('end', function () {
        deferred.resolve();
      });

    return deferred.promise();
  },

  'read': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    self.db.get(storeName + ':' + id, function (err, data) {
      if (err) {
        deferred.reject();
      } else {
        deferred.resolve(JSON.parse(data));
      }
    });

    return deferred.promise();
  },

  'query': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var elements = [];
    self.db.createReadStream()
      .on('data', function (data) {
        if (data.key.indexOf(storeName + ':') === 0) {
          elements.push(JSON.parse(data.value));
        }
      })
      .on('error', function () {
        deferred.reject();
      })
      .on('end', function () {
        deferred.resolve(elements);
      });

    return deferred.promise();
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    self.db.put(storeName + ':' + id, JSON.stringify(json), function (err) {
      if (err) {
        deferred.reject();
      } else {
        deferred.resolve();
      }
    });

    return deferred.promise();
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    self.db.del(storeName + ':' + id, function (err) {
      if (err) {
        deferred.reject();
      } else {
        deferred.resolve();
      }
    });

    return deferred.promise();
  }
});

module.exports = LevelDBBackend;