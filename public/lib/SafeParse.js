'use strict';

var core = require('wunderbits.core');
var WBSingleton = core.WBSingleton;

function parse (jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn('Unable to parse "' + jsonString + '"');
  }
  return;
}

var SafeParse = WBSingleton.extend({
  'json': parse
});

module.exports = SafeParse;
