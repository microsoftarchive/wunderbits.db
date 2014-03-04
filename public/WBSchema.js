define([

  './lib/FieldTypes',

  'wunderbits/core/WBSingleton',
  'wunderbits/core/lib/extend',

], function (
  FieldTypes,
  WBSingleton,
  extend
) {

  'use strict';

  var BaseSchema = WBSingleton.extend({
    'FieldTypes': FieldTypes,
    'fields': {}
  });

  var SpecialFieldTypes = {};
  Object.keys(FieldTypes).forEach(function (type) {
    SpecialFieldTypes[type.toLowerCase() + 's'] = FieldTypes[type];
  });

  function CustomExtend (properties) {

    // extract fields, to be merged later
    var fields = properties.fields;
    delete properties.fields;

    // extend the schema
    var schema = WBSingleton.extend.call(this, properties);
    schema.extend = CustomExtend;

    // translate the alternative format schema
    var key, val, type;
    for (key in fields) {
      val = fields[key];
      type = SpecialFieldTypes[key];
      if (type && Array.isArray(val)) {
        while(val.length) {
          fields[val.shift()] = type;
        }
        delete fields[key];
      }
    }

    // merge fields with the parent
    schema.fields = extend({}, schema.fields, fields);
    return schema;
  }

  BaseSchema.extend = CustomExtend;

  return BaseSchema;

});
