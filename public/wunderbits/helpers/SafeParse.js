'use strict';

var core = require('wunderbits.core');
var WBSingleton = core.WBSingleton;

var Console = require('./console');

function parse (jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    Console.warn('Unable to parse "' + jsonString + '"');
  }
  return;
}

var SafeParse = WBSingleton.extend({
  'json': parse
});

module.exports = SafeParse;
