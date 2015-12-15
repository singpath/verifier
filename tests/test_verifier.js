'use strict';

const expect = require('expect.js');
const verifier = require('../src/verifier.js');

describe('verifier', () => {

  describe('verify', () => {
    let client, payload;

    beforeEach(() => {
      client = {};
      payload = {
        language: 'python',
        tests: '>>> foo\n1',
        solution: 'foo = 1'
      };
    });

    it('should resolve with an unsupported language error response', done => {
      payload.language = 'dinolang';

      verifier.verify(client, payload).then(resp => {
        expect(resp.solved).to.be(false);
        expect(resp.errors).to.be('Unsupported language');
        done();
      }).catch(done);
    });

  });

});
