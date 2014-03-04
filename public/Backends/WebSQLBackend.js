define([

  '../lib/printf',
  '../lib/FieldTypes',

  'wunderbits/global',
  'wunderbits/helpers/SafeParse',

  'wunderbits/core/WBEventEmitter',
  'wunderbits/core/WBDeferred',
  'wunderbits/core/When',

  'wunderbits/core/lib/forEach',
  'wunderbits/core/lib/size'

], function (
  printf, FieldTypes,
  global,
  SafeParse,
  WBEventEmitter, WBDeferred, when,
  forEach, size,
  undefined
) {

  'use strict';

  var escape = global.escape;
  var unescape = global.unescape;

  var dbSize = (5 * 1024 * 1024);
  var defaultKeyPath = 'id';
  var DB, storeFieldMap, infoLog, errorLog;

  var migrationData = {};

  // helper to loop through stores
  function mapStores (iterator) {
    var result = [];
    var stores = Object.keys(storeFieldMap);
    forEach(stores, function (storeName, index) {
      result[index] = iterator(storeName, storeFieldMap[storeName]);
    });
    return result;
  }

  /**
   * Execute SQL
   * @param sql - sql string or template
   * other arguments are used for rendering templates
   * & last argument if a function, is used for callback
   */
  function _execute (sql) {

    var args = Array.prototype.slice.call(arguments, 0);
    var callback;

    if (typeof args[args.length - 1] === 'function') {

      callback = args.pop();
    }
    else {

      callback = function () {

        infoLog([args].concat(arguments));
      };
    }

    sql = printf.apply(null, args);

    DB.transaction(function (tx) {

      tx.executeSql(sql, [], function executeSqlCallback (t, result) {

        callback(null, result);
      }, function (t, err) {

        errorLog(err, sql);
        callback(err);
      });
    });
  }

  /**
   * Convert results object to an array of row objects
   * @param - SQLResult object
   */
  function _resultToArray (result, fields) {

    var rows = result.rows;
    var count = rows.length;

    // http://jsperf.com/declare-array-length
    var returnRows = new Array(count);

    var json, name, type, value, data, returnObj, parsed;

    for (var index = 0; index < count; index++) {

      if (!fields) {
        json = unescape(rows.item(index).json);
        returnRows[index] = SafeParse.json(json);
      }
      else {
        data = rows.item(index);
        returnObj = {
          'id': data.id
        };

        for (name in fields) {
          type = fields[name];
          value = data[name];

          if (value !== undefined) {
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

            // TODO: why is this check here ???
            if (name === 'completed_at') {
              returnObj.completed = !!value;
            }

            returnObj[name] = value;
          }
        }

        returnRows[index] = returnObj;
      }
    }

    return returnRows;
  }

  var createTableSQL = 'CREATE TABLE IF NOT EXISTS ? (? TEXT PRIMARY KEY, ?)';
  function _createTable (storeName, storeInfo) {

    var deferred = new WBDeferred();
    var keyPath = storeInfo.keyPath || defaultKeyPath;
    var fields = storeInfo.fields;
    var sql;

    if (!fields) {
      sql = printf(createTableSQL, storeName, keyPath, 'json TEXT');
    }
    else {
      if (keyPath === 'id') {
        delete fields.id;
      }

      var columns = [];
      forEach(fields, function (type, name) {

        // convert our Field types to WebSQL types
        if (type === FieldTypes.Float) {
          type = 'REAL';
        }
        else if (type === FieldTypes.Integer) {
          type = 'INTEGER';
        }
        else {
          type = 'TEXT';
        }

        columns.push('"' + name + '" ' + type);
      });

      sql = printf(createTableSQL, storeName, keyPath, columns.join(', '));
    }

    _execute(sql, function (err) {

      if (err) {
        deferred.reject();
      }
      else {
        deferred.resolve();
      }
    });
    return deferred.promise();
  }


  var querySQL = 'SELECT * from ?';
  function query (storeName) {

    var deferred = new WBDeferred();

    var storeInfo = storeFieldMap[storeName];
    var fields = storeInfo && storeInfo.fields;

    _execute(querySQL, storeName, function (error, result) {

      if (error) {
        self.trigger('error', 'ERR_QUERY_FAILED', error, storeName);
        deferred.reject();
      }
      else {
        var elements = _resultToArray(result, fields);
        deferred.resolve(elements);
      }
    });

    return deferred.promise();
  }

  var readSQL = 'SELECT * from ? WHERE ?=\'?\' LIMIT 1';
  function read (storeName, json) {

    var deferred = new WBDeferred();

    var fields = storeFieldMap[storeName].fields;
    var keyPath = storeFieldMap[storeName].keyPath || defaultKeyPath;
    var id = json[keyPath] || json.id;

    _execute(readSQL, storeName, keyPath, id, function (error, result) {

      if (error) {
        self.trigger('error', 'ERR_READ_FAILED', error, storeName, json);
        deferred.reject();
      }
      else if (result.rows.length === 0) {
        self.trigger('error', 'ERR_NOT_FOUND', error, storeName, json);
        deferred.reject();
      }
      else {
        var elements = _resultToArray(result, fields);
        deferred.resolve(elements[0]);
      }
    });

    return deferred.promise();
  }

  var upsertSQL = 'INSERT OR REPLACE INTO ? (?) VALUES (?)';
  function update (storeName, json) {

    var deferred = new WBDeferred();

    var keyPath = storeFieldMap[storeName].keyPath || defaultKeyPath;
    var id = json[keyPath] || json.id;
    var keys = [keyPath];
    var values = ['\'' + id + '\''];
    var fields = storeFieldMap[storeName].fields;

    var name, type, value;

    if (!fields) {
      keys.push('json');
      values.push('\'' + escape(JSON.stringify(json)) + '\'');
    }
    else {

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
    }

    try {

      keys = keys.join(', ');
      values = values.join(', ');
      _execute(upsertSQL, storeName, keys, values, function (error) {

        if (error) {
          self.trigger('error', 'ERR_STORE_UPDATE_FAILED',
              error, storeName, json);
          deferred.reject();
        }
        else {
          deferred.resolve();
        }
      });
    }
    catch (e) {
      deferred.reject();
    }

    return deferred.promise();
  }

  var deleteSQL = 'DELETE FROM ? WHERE ?=\'?\'';
  function destroy (storeName, json) {

    var deferred = new WBDeferred();

    var keyPath = storeFieldMap[storeName].keyPath || defaultKeyPath;
    var id = json[keyPath] || json.id;

    _execute(deleteSQL, storeName, keyPath, id, function (error) {

      if (error) {
        self.trigger('error', 'ERR_STORE_DESTROY_FAILED',
            error, storeName, json);
        deferred.reject();
      }
      else {
        deferred.resolve();
      }
    });

    return deferred.promise();
  }

  var deleteAllSQL = 'DROP TABLE IF EXISTS ?';
  function clearStore (storeName) {

    var deferred = new WBDeferred();

    _execute(deleteAllSQL, storeName, function emptyTableExecuteCallback () {

      _createTable(storeName, storeFieldMap[storeName])
        .done(deferred.resolve, deferred)
        .fail(deferred.reject, deferred);
    });

    return deferred.promise();
  }

  // Clean up the DB
  function truncate (callback) {

    // pause all DB operations
    var deferred = new WBDeferred();
    self.ready = new WBDeferred();

    var storeClearPromises = mapStores(clearStore);
    when(storeClearPromises).then(function () {

      // reject all DB operations
      self.ready.reject();
      deferred.resolve();

      // LEGACY: remove this
      if (typeof callback === 'function') {
        callback();
      }

      self.trigger('truncated');
    });

    return deferred.promise();
  }

  function _getTables () {

    var tablesSQL = 'SELECT * FROM sqlite_master WHERE type=\'table\'';
    var tablesDeferred = new WBDeferred();

    _execute(tablesSQL, function (err, result) {

      if (err) {
        tablesDeferred.reject();
      }
      else if (result.rows.length <= 1) {
        tablesDeferred.reject();
      }
      else {
        var rows = result.rows;
        var count = rows.length;
        var tables = [];

        for (var index = 0; index < count; index++) {
          var data = rows.item(index);
          tables.push(data.name);
        }

        tablesDeferred.resolve(tables);
      }
    });

    return tablesDeferred.promise();
  }

  function _checkSchema (storeFieldMap) {

    var schemaDeferred = new WBDeferred();

    var tablesPromise = _getTables();

    tablesPromise.fail(schemaDeferred.reject, schemaDeferred);

    tablesPromise.done(function (tables) {

      forEach(storeFieldMap, function (val, name) {

        if (tables.indexOf(name) === -1) {
          schemaDeferred.reject();
        }
      });

      schemaDeferred.resolve();
    });

    return schemaDeferred.promise();
  }

  function connect (options) {

    storeFieldMap = options.stores;
    infoLog = options.infoLog;
    errorLog = options.errorLog;

    var dbDeferred = self.ready;

    // in the event that safari is broken after an update
    var initTimeout = setTimeout(function () {

      dbDeferred.reject();
    }, 2000);

    dbDeferred.done(function () {

      clearTimeout(initTimeout);
    });

    try {
      // Safari needs the DB to initialized with **exactly** 5 mb storage
      DB = global.openDatabase(options.name, '', options.name, dbSize);
    }
    catch (e) {
      console.warn(e);
      dbDeferred.reject();
    }

    // check db version first, if not same, build tables
    var dbVersion = '' + options.version;
    if (DB.version !== dbVersion) {

      infoLog('version mismatch');
      self.publish('upgraded');
      readAllForMigration().then(function () {

        DB.changeVersion(DB.version, dbVersion, function () {

          truncate().done(function () {

            var deferreds = mapStores(_createTable);

            when(deferreds).done(function () {

              infoLog('db rebuilt');
              writeAllForMigration().then(dbDeferred.resolve, dbDeferred);
            });
          }).fail(function () {

            dbDeferred.reject();
          });
        });
      });
    }
    else {
      // don't trust the db version, check the actual table structure
      // if it ain't right, fix it
      var check = _checkSchema(storeFieldMap);
      check.then(function () {

        // infoLog('correct schema');
        dbDeferred.resolve();
      });

      check.fail(function () {

        // infoLog('wrong schema');
        readAllForMigration().then(function () {

          truncate().done(function () {

            var deferreds = mapStores(_createTable);

            when(deferreds).done(function () {

              infoLog('db rebuilt');
              writeAllForMigration(dbDeferred.resolve, dbDeferred);
            });
          }).fail(function () {

            dbDeferred.reject();
          });
        });
      });
    }

    return dbDeferred.promise();
  }

  function readAllForMigration () {

    infoLog('migrating any existing data');

    var deferred = new WBDeferred();
    var tableDeferreds = [];

    _getTables().always(function (tables) {

      forEach(tables, function (table) {

        // ignore browser websql special tables & tables not in the map
        if (/^[^\_]/.test(table) && (table in storeFieldMap)) {

          infoLog('reading ' + table);
          var def = new WBDeferred();
          query(table, {
            'success': function (data) {

              migrationData[table] = data;
              def.resolve();
            }
          });
          tableDeferreds.push(def);
        }
      });

      if (tableDeferreds.length) {
        when(tableDeferreds).done(deferred.resolve, deferred);
      }
      else {
        deferred.resolve();
      }
    });

    return deferred.promise();
  }

  function writeAllForMigration () {

    infoLog('writing existing data to new database');

    var updateDeferreds = [];
    var deferred = new WBDeferred();

    forEach(migrationData, function (data, storeName) {

      if (size(data)) {

        infoLog('writing ' + storeName);

        forEach(data, function (obj) {

          updateDeferreds[obj.id] = new WBDeferred();
          update(storeName, obj, {
            'success': function () {

              updateDeferreds[obj.id].resolve();
            }
          });
        });
      }

      delete migrationData[storeName];
    });

    if (updateDeferreds.length) {
      when(updateDeferreds).then(deferred.resolve, deferred);
    }
    else {
      deferred.resolve();
    }

    return deferred.promise();
  }

  var WebSQLBackend = WBEventEmitter.extend({

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

  var self = new WebSQLBackend();
  return self;

});