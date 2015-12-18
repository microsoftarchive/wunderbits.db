describe('Backends/IndexedDBBackend', function () {

  'use strict';

  var IndexedDBBackend = require('Backends/IndexedDBBackend');
  var instance;

  beforeEach(function () {

    instance = new IndexedDBBackend({});
  });

  describe('#getWriteTransaction', function () {

    beforeEach(function () {

      instance.db = {
        'transaction': function () {
          throw new Error('error error');
        }
      };
    });

    it('should catch errors from indexeddb transaction', function () {

      expect(function () {
        instance.getWriteTransaction();
      }).to.not.throw;
    });
  });
});