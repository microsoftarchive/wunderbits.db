describe('Backends/IndexedDBBackend', function () {

  'use strict';

  var IndexedDBBackend = require('Backends/IndexedDBBackend');
  var instance;

  beforeEach(function () {

    instance = new IndexedDBBackend({});
  });

  describe('Given this.db.transaction throws an Error', function () {

    beforeEach(function () {

      instance.db = {
        'transaction': function () {
          throw new Error('transaction error');
        }
      };
    });

    describe('#_getTransaction', function () {

      it('should not throw', function () {

        expect(function () {
          instance._getTransaction('someStore', 'someType');
        }).to.not.throw(Error);
      });
    });

    describe('#_getWriteTransaction', function () {

      it('should not throw', function () {

        expect(function () {
          instance._getWriteTransaction();
        }).to.not.throw(Error);
      });
    });

    describe('#_getReadTransaction', function () {

      it('should not throw', function () {

        expect(function () {
          instance._getReadTransaction();
        }).to.not.throw(Error);
      });
    });
  });
});