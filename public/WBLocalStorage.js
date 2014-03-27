define([
  './localStorage/WBBrowserLocalStorage',
  './localStorage/WBChromeLocalStorage',
  './wunderbits/global'
], function (
  WBBrowserLocalStorage,
  WBChromeLocalStorage,
  global
) {

  'use strict';

  var localStorageClass;
  if (global.chrome && global.chrome.storage) {
    localStorageClass = WBChromeLocalStorage;
  }
  else {
    localStorageClass = WBBrowserLocalStorage;
  }

  return localStorageClass;
});