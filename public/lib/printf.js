define(function (undefined) {

  'use strict';

  // Generate SQLs, WebSQL's formatter blows
  return function printf (text) {

    var i = 1;
    var args = arguments;

    return text.replace(/\?/g, function () {
      var val = args[i++];
      return (val === undefined) ? '' : val;
    });
  };
});