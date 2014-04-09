'use strict';

var chrome = global.chrome;
var isChromeApp = chrome && chrome.storage;

var localStorageClass;
if (isChromeApp) {
  localStorageClass = require('./localStorage/WBChromeLocalStorage');
} else {
  localStorageClass = require('./localStorage/WBBrowserLocalStorage');
}

module.exports = localStorageClass;
