describe('localStorage/Chrome', function () {
  'use strict';

  if (!chrome) {
    return;
  } 
  var storage;

  var WBChromeLocalStorage = require('localStorage/WBChromeLocalStorage');

  describe('CRUD', function () {
    it ('Can clear the local database', function (done) {
      var checkClear = function(val) {
        expect(val).to.equal(undefined);
        done();
      };

      var tryToRetrieveItem = function() {
        storage.getItem('something').done(checkClear);
      };

      var itemHasBeenSet = function() {
        storage.clear().done(tryToRetrieveItem);
      };

      storage = new WBChromeLocalStorage();
      storage.setItem('something', 'else').done(itemHasBeenSet);
    });

    it ('Can add and retrieve an item', function (done) {
      var itemGet = function(val) {
        expect(val).to.eql('a value');
        storage.removeItem('a key').done(done);
      };
      var itemSet = function() {
        storage.getItem('a key').done(itemGet);        
      };

      storage = new WBChromeLocalStorage();
      storage.setItem('a key', 'a value').done(itemSet);
    });
  });
});
