describe('localStorage/Chrome', function () {
  'use strict';

  if (!chrome) {
    return;
  } 
  var storage;

  var WBChromeLocalStorage = require('localStorage/WBChromeLocalStorage');

  describe('basic functionality', function () {
    it ('should not throw exceptions', function (done) {
      var itemGet = function(val) {
        expect(val).to.eql("a value");
        storage.removeItem("a key").done(done);
      }
      var itemSet = function() {
        storage.getItem("a key").done(itemGet);        
      }

      storage = new WBChromeLocalStorage()
      storage.setItem("a key", "a value").done(itemSet);
    });
  })
})
