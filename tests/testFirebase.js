'use strict';

const expect = require('expect.js');
const sinon = require('sinon');

const verifier = require('../');


describe('firebase', () => {

  describe('factory', () => {

    beforeEach(() => {
      sinon.stub(verifier.firebase, 'RxFirebase').returnsThis();
    });

    afterEach(() => {
      verifier.firebase.RxFirebase.restore();
    });

    it('should return a function', () => {
      expect(verifier.firebase.factory('foo')).to.be.a(Function);
    });

    it('should throw if passed an invalid id', () => {
      expect(() => verifier.firebase.factory('foo.bar')).to.throwException();
    });

    it('should return a firebase factory', () => {
      const refFactory = verifier.firebase.factory('foo');
      const ref = refFactory();

      sinon.assert.calledOnce(verifier.firebase.RxFirebase);
      sinon.assert.calledOn(verifier.firebase.RxFirebase, ref);
      sinon.assert.calledWithExactly(verifier.firebase.RxFirebase, 'https://foo.firebaseio.com');
    });

    it('should return a firebase factory taking a path argument', () => {
      const refFactory = verifier.firebase.factory('foo');

      refFactory('bar');
      sinon.assert.calledWithExactly(verifier.firebase.RxFirebase, 'https://foo.firebaseio.com/bar');
    });

    it('should return a firebase factory taking an array path argument', () => {
      const refFactory = verifier.firebase.factory('foo');

      refFactory(['bar', 'baz']);
      sinon.assert.calledWithExactly(verifier.firebase.RxFirebase, 'https://foo.firebaseio.com/bar/baz');
    });
  });

  describe('RxFirebase', () => {

    it('should patch Firebase', () => {
      expect(verifier.firebase.RxFirebase.prototype.observe).to.be.ok();
      expect(verifier.firebase.RxFirebase.prototype.observeAuth).to.be.ok();
    });

    describe('observe', () => {
      let inst;

      beforeEach(() => {
        inst = {
          on: sinon.stub(),
          off: sinon.stub(),
          observe: verifier.firebase.RxFirebase.prototype.observe
        };
      });

      it('should return an Observable', () => {
        const obs = inst.observe('value');
        const sub = obs.subscribe(() => undefined);

        expect(sub.dispose).to.be.a(Function);
        sub.dispose();
      });

      it('should listen for data changes at a firebase location', () => {
        const snapshot = {};

        inst.on.onFirstCall().yields(snapshot);

        return inst.observe('value').take(1).toPromise().then(value => {
          sinon.assert.calledOnce(inst.on);
          sinon.assert.calledWithExactly(inst.on, 'value', sinon.match.func, sinon.match.func);
          expect(value).to.be(snapshot);
        });
      });

      it('should return a stream emitting an error on cancel event', () => {
        const err = new Error();

        inst.on.onFirstCall().callsArgWith(2, err);

        return inst.observe('value').take(1).toPromise().then(
          () => Promise.reject(new Error('unexpected')),
          e => expect(e).to.be(err)
        );
      });

      it('should detach the event handler when unsubscribing to the observable', () => {
        inst.on.onFirstCall().yields({});

        return inst.observe('value').take(1).toPromise().then(() => {
          const handler = inst.on.getCall(0).args[1];

          sinon.assert.calledOnce(inst.off);
          sinon.assert.calledWithExactly(inst.off, 'value', handler);
        });
      });

    });

    describe('observeAuth', () => {
      let inst;

      beforeEach(() => {
        inst = {
          onAuth: sinon.stub(),
          offAuth: sinon.stub(),
          getAuth: sinon.stub().returns({}),
          observeAuth: verifier.firebase.RxFirebase.prototype.observeAuth
        };
      });

      it('should return an Observable', () => {
        const obs = inst.observeAuth();
        const sub = obs.subscribe(() => undefined);

        expect(sub.dispose).to.be.a(Function);
        sub.dispose();
      });

      it('should listen for auth changes', () => {
        const auth = {};

        inst.onAuth.onFirstCall().yields(auth);

        return inst.observeAuth().take(2).toPromise().then(value => {
          sinon.assert.calledOnce(inst.onAuth);
          sinon.assert.calledWithExactly(inst.onAuth, sinon.match.func);
          expect(value).to.be(auth);
        });
      });

      it('should stop listen for auth changes on dispose', () => {
        inst.onAuth.onFirstCall().yields({});

        return inst.observeAuth().take(2).toPromise().then(() => {
          const handler = inst.onAuth.getCall(0).args[0];

          sinon.assert.calledOnce(inst.offAuth);
          sinon.assert.calledWithExactly(inst.offAuth, handler);
        });
      });

    });

  });

});
