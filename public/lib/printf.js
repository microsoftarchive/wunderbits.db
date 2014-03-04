define(function () {

  'use strict';

  // Generate SQLs, WebSQL's formatter blows
  return function printf (text) {

    var i = 1;
    var args = arguments;

    return text.replace(/\?/g, function () {

      var val = args[i++];

      // http://jsperf.com/type-of-undefined-vs-undefined/9
      return (val === void 0) ? '' : val;
    });
  };
});