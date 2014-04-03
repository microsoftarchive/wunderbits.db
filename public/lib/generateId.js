'use strict';

function replacer () {
  return (Math.random() * 16 | 0).toString(16);
}

// Auto-generate IDs for new objects
function autoID () {
  return 'lw' + (new Array(31)).join('x').replace(/x/g, replacer);
}

module.exports = autoID;
