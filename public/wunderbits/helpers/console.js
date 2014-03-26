'use strict';

var Global = require('wunderbits/global');

// HTML5 boilerplate - MIT
// Avoid `console` errors in browsers that lack a console - e.g. < IE 10
var method;
var noop = function () {};
var methods = [
  'assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error',
  'exception', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log',
  'markTimeline', 'profile', 'profileEnd', 'table', 'time', 'timeEnd',
  'timeStamp', 'trace', 'warn'
];
var length = methods.length;
var Console = (Global.console = Global.console || {});

while (length--) {
  method = methods[length];
  // Only stub undefined methods.
  if (!Console[method]) {
    Console[method] = noop;
  }
}

module.exports = Console;
