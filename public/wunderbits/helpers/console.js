define([
  'wunderbits/global'
], function (global, undefined) {

  'use strict';

  // HTML5 builerplate - MIT
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
  var console = (global.console = global.console || {});

  while (length--) {

    method = methods[length];

    // Only stub undefined methods.
    if (!console[method]) {

      console[method] = noop;
    }
  }

  return console;
});