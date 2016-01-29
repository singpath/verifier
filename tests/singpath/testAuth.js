'use strict';

var Rx = require('rx-lite');
const expect = require('expect.js');
const sinon = require('sinon');

const verifier = require('../../');

describe('singpath/auth', () => {
  let firebase, singpath, ref, status;

  beforeEach(() => {
    status = new Rx.ReplaySubject(1);
    ref = {
      observeAuth: sinon.stub().returns(status),
      observe: sinon.stub(),
      authWithCustomToken: sinon.stub().returns(Promise.resolve({uid: 'bob'})),
      unauth: sinon.spy()
    };
    firebase = sinon.stub().returns(ref);
    singpath = new verifier.singpath.Singpath(firebase);
  });

  it('should be one of the singpath service', () => {
    expect(singpath.auth).to.be.ok();
  });

  describe('Auth', () => {

    describe('status', () => {

      it('should emit the auth changes', () => {
        const authData = {uid: 'bob'};
        const promise = singpath.auth.status().take(4).toArray().toPromise().then(events => {
          expect(events).to.have.length(4);
          expect(events[0]).to.be(undefined);
          expect(events[1].uid).to.be('bob');
          expect(events[2]).to.be(undefined);
          expect(events[3].uid).to.be('bob');
        });

        status.onNext(null);
        status.onNext(authData);
        status.onNext(null);
        status.onNext(authData);

        return promise;
      });

      it('should share the status observable', () => {
        expect(singpath.auth.status()).to.be(singpath.auth.status());
      });

      it('should replay the last emitted status', () => {
        const authData = {uid: 'bob'};

        status.onNext(null);
        status.onNext(authData);

        return singpath.auth.status().take(1).toPromise().then(
          auth => expect(auth.uid).to.be('bob')
        ).then(
          () => singpath.auth.status().take(1).toPromise()
        ).then(
          auth => expect(auth.uid).to.be('bob')
        );
      });

      it('should normalise auth via custom user token', () => {
        const authData = {
          uid: 'bob',
          auth: {isUser: true}
        };

        status.onNext(null);
        status.onNext(authData);

        return singpath.auth.status().take(1).toPromise().then(auth => {
          expect(auth.uid).to.be('bob');
          expect(auth.isUser).to.be(true);
          expect(auth.isWorker).to.be(false);
        });
      });

      it('should normalise auth via custom worker token', () => {
        const authData = {
          uid: 'bob',
          auth: {
            isWorker: true,
            queue: 'default'
          }
        };

        status.onNext(null);
        status.onNext(authData);

        return singpath.auth.status().take(1).toPromise().then(auth => {
          expect(auth.uid).to.be('bob');
          expect(auth.isUser).to.be(false);
          expect(auth.isWorker).to.be(true);
          expect(auth.queue).to.be('default');
        });
      });

      it('should normalise auth via google oauth', () => {
        const authData = {
          uid: 'google:12345',
          provider: 'google',
          google: {
            email: 'bob@example.com',
            displayName: 'Bob'
          }
        };

        status.onNext(null);
        status.onNext(authData);

        return singpath.auth.status().take(1).toPromise().then(auth => {
          expect(auth.uid).to.be('google:12345');
          expect(auth.email).to.be('bob@example.com');
          expect(auth.displayName).to.be('Bob');
          expect(auth.isUser).to.be(true);
          expect(auth.isWorker).to.be(false);
        });
      });

    });

    describe('login', () => {

      it('should first log the user out', () => {
        singpath.auth.login('someToken');
        sinon.assert.calledOnce(ref.unauth);
      });

      it('should then log the user in using the token', () => {
        singpath.auth.login('someToken');
        sinon.assert.calledOnce(ref.authWithCustomToken);
        sinon.assert.calledWithExactly(ref.authWithCustomToken, 'someToken');
        sinon.assert.callOrder(ref.unauth, ref.authWithCustomToken);
      });

      it('should resolve with the auth data', () => {
        return singpath.auth.login('someToken').then(auth => {
          expect(auth.uid).to.be('bob');
        });
      });

      it('should reject if authentication failed', () => {
        const err = new Error();

        ref.authWithCustomToken.returns(Promise.reject(err));

        return singpath.auth.login('someToken').then(
          () => Promise.reject(new Error('unexpected')),
          e => expect(e).to.be(err)
        );
      });

      it('should share concurrent login attempt', () => {
        expect(singpath.auth.login()).to.be(singpath.auth.login());
      });

    });

    describe('logout', () => {

      it('should log the user out', () => {
        singpath.auth.logout();
        sinon.assert.calledOnce(ref.unauth);
      });

    });

  });

});
