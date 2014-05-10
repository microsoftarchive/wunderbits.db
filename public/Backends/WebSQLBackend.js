'use strict';

var core = require('wunderbits.core');
var WBDeferred = core.WBDeferred;
var when = core.lib.when;

var AbstractBackend = require('./AbstractBackend');
var printf = require('../lib/printf');
var FieldTypes = require('../lib/FieldTypes');
var SafeParse = require('../lib/SafeParse');

var openConnection = global.openDatabase;
var escape = global.escape;
var unescape = global.unescape;

var SQL = {
  'createTable': 'CREATE TABLE IF NOT EXISTS ? (? TEXT PRIMARY KEY, ?)',
  'truncateTable': 'DELETE FROM ?',
  'dropTable': 'DROP TABLE IF EXISTS ?',
  'getAllTables': 'SELECT * FROM sqlite_master WHERE type=\'table\'',

  'read': 'SELECT * from ? WHERE ?=\'?\' LIMIT 1',
  'query': 'SELECT * from ?',
  'upsert': 'INSERT OR REPLACE INTO ? (?) VALUES (?)',
  'destroy': 'DELETE FROM ? WHERE ?=\'?\''
};

// We need to map schema types to websql types
var TYPES = { 'default': 'TEXT' };
TYPES[FieldTypes.Float] = 'REAL';
TYPES[FieldTypes.Integer] = 'INTEGER';

var WebSQLBackend = AbstractBackend.extend({

  'dbSize': (5 * 1024 * 1024),

  'openDB': function (name, version) {

    var self = this;
    var readyDeferred = self.ready;

    // in case safari is broken after an update
    var initTimeout = setTimeout(function () {
      self.openFailure('ERR_WS_CONNECT_TIMEOUT');
    }, 2000);

    readyDeferred.done(function () {
      clearTimeout(initTimeout);
    });

    try {
      // Safari needs the DB to initialized with **exactly** 5 mb storage
      var db = openConnection(name, '', name, self.dbSize);
      self.db = db;

      // WebSQL versions are strings
      version = '' + version;

      // check if we need to upgrade the schema
      if (db.version !== version) {
        db.changeVersion(db.version || '', version, function () {

          self.onUpgradeNeeded()
            .done(self.openSuccess, self)
            .fail(self.openFailure, self);
        });
      }
      // schema correct
      else {
        self.openSuccess();
      }
    } catch (error) {
      self.openFailure('ERR_WS_CONNECT_FAILED', error);
    }
  },

  'execute': function (sql) {

    var self = this;

    var deferred = new WBDeferred();

    // create a transaction
    self.db.transaction(function (transaction) {

      // execute the sql
      transaction.executeSql(sql, [], function (tx, result) {
        deferred.resolve(result);
      }, function (tx, err) {
        deferred.reject(err);
      });
    });

    return deferred.promise();
  },

  'parseGeneric': function (data) {
    return SafeParse.json(unescape(data.json));
  },

  'populateGeneric': function (keys, values, json) {

    keys.push('json');
    values.push('\'' + escape(JSON.stringify(json)) + '\'');
  },

  'parseFields': function (data, fields) {
    var obj = {
      'id': data.id
    };

    var name, type, value, parsed;
    for (name in fields) {
      type = fields[name];
      value = data[name];

      if (data[name] !== undefined) {
        if (type === FieldTypes.Integer) {
          parsed = parseInt(value, 10);
          if (isNaN(value)) {
            console.warn('failed to parse %s as Integer', value);
          }
          value = parsed || 0;
        }
        else if (type === FieldTypes.Float) {
          parsed = parseFloat(value, 10);
          if (isNaN(value)) {
            console.warn('failed to parse %s as Float', value);
          }
          value = parsed || 0;
        }
        else {

          // don't unescape nulls & undefineds
          value = value && unescape(value);

          if (type === FieldTypes.Boolean) {
            value = (value === 'true');
          }
          else if (type === FieldTypes.Array) {
            value = SafeParse.json(value) || [];
          }
          else if (type === FieldTypes.Object) {
            value = SafeParse.json(value) || {};
          }
          else if (value === '') {
            value = null;
          }
        }
        obj[name] = value;
      }
    }

    return obj;
  },

  'populateFields': function (keys, values, json, fields, keyPath) {

    var name, type, value;
    for (name in fields) {

      type = fields[name];
      value = json[name];

      if (value !== undefined && name !== keyPath) {

        if (type === FieldTypes.Float || type === FieldTypes.Integer) {
          value = (!!value && !isNaN(value)) ? value : 0;
        }
        else if (type === FieldTypes.Array && Array.isArray(value)) {
          value = '\'' + escape(JSON.stringify(value)) + '\'';
        }
        else if (type === FieldTypes.Object) {
          value = '\'' + escape(JSON.stringify(value)) + '\'';
        }
        else {
          value = (value !== null) ? '\'' + escape(value) + '\'' : 'NULL';
        }

        keys.push('"' + name + '"');
        values.push(value);
      }
    }
  },

  'toArray': function (rows, fields) {

    var self = this;
    var count = rows.length;
    var returnRows = new Array(count);
    var parse = self[fields ? 'parseFields' : 'parseGeneric'];

    var data;
    for (var index = 0; index < count; index++) {
      data = rows.item(index);
      returnRows[index] = parse.call(self, data, fields);
    }

    return returnRows;
  },

  'onUpgradeNeeded': function () {

    var self = this;

    var deferred = new WBDeferred();

    self.trigger('upgrading');

    var storeClearPromises = self.mapStores(self.clearStore);
    when(storeClearPromises).always(function () {

      self.listTables()
        .done(function (tables) {

          tables = tables || [];

          var dropPromises = tables.length ? tables.map(function (table) {
            return self.dropStore(table);
          }) : [];

          when(dropPromises).always(function () {

            var storeCreationDeferreds = self.mapStores(self.createStore);
            when(storeCreationDeferreds)
              .done(function () {
                deferred.resolve();
              })
              .fail(function () {
                deferred.reject();
              });
          })
          .fail(function () {
            console.warn('table drop failed');
          });
        })
        .fail(function () {
          console.warn('get tables failed');
        });
    })
    .fail(function () {
      console.warn('clear failed');
    });

    return deferred.promise();
  },

  'createStore': function (storeName, storeInfo) {

    var self = this;

    var deferred = new WBDeferred();
    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var fields = storeInfo.fields;

    var sql = SQL.createTable;
    if (!fields) {
      sql = printf(sql, storeName, keyPath, 'json TEXT');
    }
    else {

      if (keyPath === 'id') {
        delete fields.id;
      }

      // convert our Field types to WebSQL types
      var columns = Object.keys(fields).map(function (type) {
        return '"' + type + '" ' + (TYPES[fields[type]] || TYPES.default);
      });

      sql = printf(sql, storeName, keyPath, columns.join(', '));
    }

    self.execute(sql)
      .done(deferred.resolve, deferred)
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_STORE_CREATION_FAILED', error, storeName);
        deferred.reject();
      });

    return deferred.promise();
  },

  'dropStore': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();
    var sql = printf(SQL.dropTable, storeName);
    self.execute(sql)
      .done(deferred.resolve, deferred)
      .fail(function () {
        deferred.reject();
      });

    return deferred.promise();
  },

  'clearStore': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var sql = printf(SQL.truncateTable, storeName);
    self.execute(sql)
      .done(deferred.resolve, deferred)
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_CLEAR_FAILED', error, storeName);
        deferred.reject();
      });

    return deferred.promise();
  },

  'listTables': function () {

    var self = this;
    var deferred = new WBDeferred();

    self.execute(SQL.getAllTables)
      .done(function (result) {

        var rows = result.rows;
        var data;
        var count = rows.length;
        var returnRows = [];
        for (var index = 1; index < count; index++) {
          data = rows.item(index);
          returnRows.push(data.name);
        }

        deferred.resolve(returnRows);
      });

    return deferred.promise();
  },

  'read': function (storeName, json) {

    var self = this;

    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var fields = storeInfo.fields;

    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    var sql = printf(SQL.read, storeName, keyPath, id);
    self.execute(sql)
      .done(function (result) {
        if (result.rows.length === 0) {
          self.trigger('error', 'ERR_WS_OBJECT_NOT_FOUND', null, storeName, json);
          deferred.reject();
        }
        else {
          var elements = self.toArray(result.rows, fields);
          deferred.resolve(elements[0]);
        }
      })
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_READ_FAILED', error, storeName, json);
        deferred.reject();
      });

    return deferred.promise();
  },

  'query': function (storeName) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var fields = storeInfo && storeInfo.fields;

    var sql = printf(SQL.query, storeName);
    self.execute(sql)
      .done(function (result) {
        var elements = self.toArray(result.rows, fields);
        deferred.resolve(elements);
      })
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_QUERY_FAILED', error, storeName);
        deferred.reject();
      });

    return deferred.promise();
  },

  'update': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var fields = storeInfo.fields;

    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    var keys = ['"' + keyPath + '"'];
    var values = ['\'' + id + '\''];

    var populate = self[fields ? 'populateFields': 'populateGeneric'];
    populate.call(self, keys, values, json, fields, keyPath);

    var sql = printf(SQL.upsert, storeName, keys, values);
    try {

      self.execute(sql)
        .done(function () {
          deferred.resolve();
        })
        .fail(function (error) {
          self.trigger('error', 'ERR_WS_UPDATE_FAILED',
              error, storeName, json);
          deferred.reject();
        });
    }
    catch (error) {
      self.trigger('error', 'ERR_WS_UPDATE_FAILED',
          error, storeName, json);
      deferred.reject();
    }

    return deferred.promise();
  },

  'destroy': function (storeName, json) {

    var self = this;
    var deferred = new WBDeferred();

    var storeInfo = self.stores[storeName];
    var keyPath = storeInfo.keyPath || self.defaultKeyPath;
    var id = json[keyPath] || json.id;

    var sql = printf(SQL.destroy, storeName, keyPath, id);
    self.execute(sql)
      .done(function () {
        deferred.resolve();
      })
      .fail(function (error) {
        self.trigger('error', 'ERR_WS_DESTROY_FAILED',
            error, storeName, json);
        deferred.reject();
      });

    return deferred.promise();
  },

  'nuke': function () {

    var self = this;
    console.warn('cant delete websql database');
    return self.truncate();
  }

});

module.exports = WebSQLBackend;
