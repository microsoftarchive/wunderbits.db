define([

  './lib/generateId',

  'wunderbits/core/WBEventEmitter',

  'wunderbits/core/lib/clone',
  'wunderbits/core/lib/assert'

], function (
  generateId,
  WBEventEmitter,
  clone, assert
) {

  'use strict';

  // Default id Attribute used
  var defaultKeyPath = 'id';

  return WBEventEmitter.extend({

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
      var isAWrite = /(create|update)/.test(method);

      // Assign IDs automatically if not present
      if (isAWrite) {
        id = self.generateId(keyPath, id, instance);
      }

      // for specs, we should be able to skip this magic
      if (storeName === 'none') {
        if (typeof options.success === 'function') {
          options.success();
        }
        return;
      }

      // skip invalid crup operation or models that don't have a valid storeName
      if (storeName in stores) {

        var _success = options.success;
        options.success = function () {

          if (typeof _success === 'function') {
            _success.apply(this, arguments);
          }

          // trigger events for syncing
          if (/(create|update|destroy)/.test(method)) {
            self.database.trigger(method, storeName, id);
          }

          // Update full-text index when needed
          if ('fullTextIndexFields' in storeInfo) {
            self.trigger('index', method, storeName, instance);
          }
        };

        var request;

        // query collections
        if (method === 'read' && !instance.id && instance.model) {
          request = self.queryCollection(instance);
        }
        // regular models
        else {
          request = self.operateOnModel(instance, method);
        }

        request.done(options.success).fail(options.error);
      }
    }
  });

});