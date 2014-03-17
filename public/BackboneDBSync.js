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

    'sync': function (method, instance, options) {

      var self = this;
      options = options || {};

      var stores = self.database.stores;

      var collection = instance.collection;
      var storeName = instance.storeName || (collection && collection.storeName);
      var storeInfo = stores[storeName];
      var keyPath = (storeInfo && storeInfo.keyPath) || defaultKeyPath;
      var attributes = instance.attributes;
      var hasID = (attributes.id || attributes[keyPath]);

      // for specs, we should be able to skip this magic
      if (storeName === 'none') {

        if (/(create|update)/.test(method) && !hasID) {
          instance.set(keyPath, generateId());
        }

        return (typeof options.success === 'function') && options.success();
      }

      // skip invalid crup operation or models that don't have a valid storeName
      if (storeName in stores) {

        // Assign IDs automatically if not present
        if (/(create|update)/.test(method)) {

          if (!hasID) {
            var newId = generateId();
            if (instance.collection) {
              while (instance.collection.get(newId)) {
                newId = generateId();
              }
            }

            instance.set(keyPath, newId);
          }
        }

        var _success = options.success;
        options.success = function () {

          (typeof _success === 'function') && _success.apply(this, arguments);

          // Update full-text index when needed
          if ('fullTextIndexFields' in storeInfo) {
            self.trigger('index', method, storeName, instance);
          }
        };

        var request;
        var crud = self.database.crud;

        // query collections
        if (method === 'read' && !instance.id && instance.model) {
          storeName || (storeName = instance.model.prototype.storeName);
          request = crud.query(storeName);
        }
        // regular models
        else {
          var json;
          if (typeof instance.toJSON === 'function') {
            json = instance.toJSON();
          }
          else {
            json = clone(instance.attributes);
          }
          json.id || (json.id = instance.id);
          request = crud[method](storeName, json);
        }

        request.done(options.success).fail(options.error);
      }
    }
  });

});