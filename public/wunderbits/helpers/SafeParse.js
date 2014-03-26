'use strict';

var core = require('wunderbits.core');
var WBSingleton = core.WBSingleton;

var Console = require('./console');

var SafeParse = WBSingleton.extend({
  'json': function (jsonString) {

    var data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      Console.warn('Unable to parse "' + jsonString + '"');
    }
    return data;
  }
});

module.exports = SafeParse;
