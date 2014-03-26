'use strict';

var Global = require('wunderbits/global');
var chrome = Global.chrome;
var localStorageClass = chrome && chrome.storage ? 'WBChrome' : 'WBBrowser';

module.exports = require('./localStorage/' + localStorageClass + 'LocalStorage');
