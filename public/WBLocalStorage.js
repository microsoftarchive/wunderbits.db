'use strict';

var Global = require('./lib/global');
var chrome = Global.chrome;
var isChromeApp = chrome && chrome.storage;

var localStorageClass;
if (isChromeApp) {
  localStorageClass = require('./localStorage/WBChromeLocalStorage');
} else {
  localStorageClass = require('./localStorage/WBBrowserLocalStorage');
}

module.exports = localStorageClass;
