define([

  './AbstractBackend',

  'wunderbits/global',

  'wunderbits/core/WBDeferred'

], function (
  AbstractBackend,
  global,
  WBDeferred,
  undefined
) {

  'use strict';

  var WebSQLBackend = AbstractBackend.extend({

    'openDB': function () {},

    'createStore': function () {},

    'clearStore': function () {},

    'read': function () {},

    'query': function () {},

    'update': function () {},

    'destroy': function () {}

  });

  return new WebSQLBackend();

});
