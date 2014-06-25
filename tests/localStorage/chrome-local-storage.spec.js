describe('localStorage/Chrome', function () {

  'use strict';

  // FIXME check for chrome local storage?
  //if (!(chrome && chrome.storage && chrome.storage.local)) {
  if (!chrome) {
    return;
  } 
  var storage;

  var WBChromeLocalStorage = require('localStorage/WBChromeLocalStorage');

  describe('basic functionality', function () {
    it ('should not throw exceptions', function (done) {
      var itemGet = function(val) {
        expect(val.to.equal("a value"));
        storage.deleteItem("a key").done(done);
      }
      var itemSet = function() {
        storage.getItem("a key").done(itemGet);        
      }

      storage = new WBChromeLocalStorage()
      storage.setItem("a key", "a value").done(itemSet);
    });
  })
})
