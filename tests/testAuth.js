'use strict';

const expect = require('expect.js');
const sinon = require('sinon');
const uuid = require('node-uuid');

const verifier = require('../');

describe('auth', () => {
  let generator;

  beforeEach(() => {
    generator = {
      createToken: sinon.stub().returns('some-token')
    };

    sinon.stub(uuid, 'v4').returns('some-random-id');
  });

  afterEach(() => {
    uuid.v4.restore();
  });

  it('should return a token generator for user and worker', () => {
    const auth = verifier.auth(generator);

    expect(auth.user).to.be.an(Function);
    expect(auth.worker).to.be.an(Function);
  });

  describe('user', () => {
    let auth;

    beforeEach(() => {
      auth = verifier.auth(generator);
    });

    it('should generate a token', () => {
      expect(auth.user()).to.be('some-token');
    });

    it('should let one set the user id', () => {
      auth.user('someUser');
      sinon.assert.calledOnce(generator.createToken);
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({uid: 'someUser'}),
        sinon.match({})
      );
    });

    it('should set a random user id if it is not provided', () => {
      auth.user();
      sinon.assert.calledOnce(generator.createToken);
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({uid: 'some-random-id'}),
        sinon.match({})
      );
    });

    it('should generate a token for a non worker user', () => {
      auth.user('someUser');
      expect(
        generator.createToken.lastCall.args[0].isWoker
      ).not.to.be.ok();
    });

    it('should let generate a token with debug set to false', () => {
      auth.user('someUser');
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({}),
        sinon.match({debug: false})
      );
    });

    it('should let generate a token with debug set to false', () => {
      auth = verifier.auth(generator, true);
      auth.user('someUser');
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({}),
        sinon.match({debug: true})
      );
    });
  });

  describe('worker', () => {
    let auth;

    beforeEach(() => {
      auth = verifier.auth(generator);
    });

    it('should generate a token', () => {
      expect(auth.user()).to.be('some-token');
    });

    it('should set a random user id', () => {
      auth.worker('default');
      sinon.assert.calledOnce(generator.createToken);
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({uid: 'some-random-id'}),
        sinon.match({})
      );
    });

    it('should generate a token for a worker', () => {
      auth.worker('default');
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({isWorker: true}),
        sinon.match({})
      );
    });

    it('should generate a token for a a specific queue', () => {
      auth.worker('someQueue');
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({queue: 'someQueue'}),
        sinon.match({})
      );
    });

    it('should let generate a token with debug set to false', () => {
      auth.worker('default');
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({}),
        sinon.match({debug: false})
      );
    });

    it('should let generate a token with debug set to false', () => {
      auth = verifier.auth(generator, true);
      auth.worker('default');
      sinon.assert.calledWithExactly(
        generator.createToken,
        sinon.match({}),
        sinon.match({debug: true})
      );
    });
  });

});
