'use strict';

// Generate SQLs, WebSQL's formatter blows
function printf (text) {

  var i = 1;
  var args = arguments;

  return text.replace(/\?/g, function () {
    var value = args[i++];
    if (value === undefined) {
      return '';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value;
  });
}

module.exports = printf;
