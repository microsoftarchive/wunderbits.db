describe('Backends/IndexedDBBackend', function () {

  'use strict';

  // this suite is only for browsers that support WebSQL
  if (!('openDatabase' in global)) {
    return;
  }

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