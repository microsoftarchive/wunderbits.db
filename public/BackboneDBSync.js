'use strict';

var core = require('wunderbits.core');
var WBEventEmitter = core.WBEventEmitter;
var clone = core.lib.clone;
var assert = core.lib.assert;

var generateId = require('./lib/generateId');

// Default id Attribute used
var defaultKeyPath = 'id';
var noop = function () {};

var BackboneDBSync = WBEventEmitter.extend({

  'initialize': function (options) {

    var self = this;
    assert.object(options);
    assert(options.database);

    self.database = options.database;
  },

  'generateId': function (keyPath, id, instance) {

    if (!id) {
      id = generateId();
      if (instance.collection) {
        while (instance.collection.get(id)) {
          id = generateId();
        }
      }
      instance.set(keyPath, id);
    }

    return id;
  },

  'queryCollection': function (collection) {

    var self = this;
    var crud = self.database.crud;
    var storeName = collection.storeName || collection.model.prototype.storeName;
    return crud.query(storeName);
  },

  'operateOnModel': function (model, method) {

    var self = this;
    var crud = self.database.crud;
    var json;
    if (typeof model.toJSON === 'function') {
      json = model.toJSON();
    }
    else {
      json = clone(model.attributes);
    }
    json.id || (json.id = model.id);
    return crud[method](model.storeName, json);
  },

  'sync': function (method, instance, options) {

    var self = this;
    options = options || {};

    var stores = self.database.stores;

    var collection = instance.collection;
    var storeName = instance.storeName || (collection && collection.storeName);
    var storeInfo = stores[storeName];
    var keyPath = (storeInfo && storeInfo.keyPath) || defaultKeyPath;
    var attributes = instance.attributes;
    var id = attributes.id || attributes[keyPath];
    var isAWrite = self.isCreateUpdate(method);

    // Assign IDs automatically if not present
    if (isAWrite) {
      id = self.generateId(keyPath, id, instance);
    }

    // for specs, we should be able to skip this magic
    if (!storeName || storeName === 'none') {
      if (typeof options.success === 'function') {
        options.success();
      }
      return;
    }

    // skip invalid crud operation or models that don't have a valid storeName
    if (storeName in stores) {
      options.success = self.successFactory(
        options.success,
        method, storeName, storeInfo,
        id, instance
      );

      var request;
      // query collections
      if (method === 'read' && !instance.id && instance.model) {
        request = self.queryCollection(instance);
      }
      // regular models
      else {
        request = self.operateOnModel(instance, method);
      }

      request.done(options.success);
      options.error && request.fail(options.error);
    }
  },

  'successFactory': function (success, method, storeName, storeInfo, id, instance) {

    var self = this;

    var _success = (typeof success === 'function') ? success : noop;

    // trigger events for syncing
    var _dispatchCUD = self.isCreateUpdateDelete(method) ? function () {

      self.database.trigger(method, storeName, id);
    } : noop;

    // Update full-text index when needed
    var _index = ('fullTextIndexFields' in storeInfo) ? function () {

      self.trigger('index', method, storeName, instance);
    } : noop;

    var _dispatchWriteDestroy = self.isCreateUpdate(method) ? function () {

      self.trigger('write', storeName, id);
    } : self.isDelete(method) ? function () {

      self.trigger('destroy', storeName, id);
    } : noop;

    return function () {

      _success.apply(this, arguments);
      _dispatchCUD();
      _index();
      _dispatchWriteDestroy();
    };
  },

  'isCreateUpdateDelete': function (method) {

    return method === 'create' || method ==='update' || method === 'delete';
  },

  'isCreateUpdate': function (method) {

    return method === 'create' || method ==='update';
  },

  'isDelete': function (method) {

    return method === 'delete';
  }
});

module.exports = BackboneDBSync;
