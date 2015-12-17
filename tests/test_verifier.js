'use strict';

const expect = require('expect.js');
const sinon = require('sinon');
const MemoryStream = require('memorystream');

const verifier = require('../src/verifier.js');

const noop = () => undefined;

describe('verifier', () => {

  describe('verify', () => {
    let client, payload, results, container, stream;

    beforeEach(() => {
      payload = {
        language: 'python',
        tests: '>>> foo\n1',
        solution: 'foo = 1'
      };
      results = {
        solved: true
      };

      stream = new MemoryStream();

      container = {
        start: sinon.stub().yields(null, {}),
        attach: sinon.stub().yields(null, stream),
        wait: (cb) => {
          // Not setting docker log header
          stream.write(new Buffer(JSON.stringify(results)));
          stream.end();

          setImmediate(cb, null, {});
        },
        remove: sinon.stub().yields(null, {}),
        modem: {
          demuxStream: (stream, stdout) => {
            stream.on('readable',() => {
              // modem.demuxStream would normally parse a log header
              const data = stream.read();

              if (data !== null) {
                stdout.write(data);
              }
            });
          }
        }
      };

      client = {
        createContainer: sinon.stub().yields(null, container)
      };
    });

    it('should resolve with an unsupported language error response', () => {
      payload.language = 'dinolang';

      return verifier.verify(client, payload).then(resp => {
        expect(resp.solved).to.be(false);
        expect(resp.errors).to.be('Unsupported language');
      });
    });

    it('should run the payload if the language is supported', () => {
      return verifier.verify(client, payload).then(resp => {
        expect(resp.solved).to.be(true);
      });
    });

    it('should remove the payload after running the solution', () => {
      return verifier.verify(client, payload).then(() => {
        sinon.assert.calledOnce(container.remove);
        sinon.assert.calledWithExactly(
          container.remove,
          {force: true},
          sinon.match.func
        );
      });
    });

    it('should create a container to run the payload', () => {
      return verifier.verify(client, payload).then(() => {
        sinon.assert.calledOnce(client.createContainer);
        sinon.assert.calledWithExactly(
          client.createContainer,
          sinon.match({}),
          sinon.match.func
        );
      });
    });

    it('should create a container to run the payload with a matching image', () => {
      return verifier.verify(client, payload).then(() => {
        sinon.assert.calledWithExactly(
          client.createContainer,
          sinon.match.has('Image', 'singpath/verifier2-python:latest'),
          sinon.match.func
        );
      });
    });

    it('should create a container to run the payload with a matching image tag', () => {
      return verifier.verify(client, payload, {imageTag: '2.1.5'}).then(() => {
        sinon.assert.calledWithExactly(
          client.createContainer,
          sinon.match.has('Image', 'singpath/verifier2-python:2.1.5'),
          sinon.match.func
        );
      });
    });

    it('should create a container to run the payload with no capability', () => {
      return verifier.verify(client, payload, {imageTag: '2.1.5'}).then(() => {
        sinon.assert.calledWithExactly(
          client.createContainer,
          sinon.match.has('HostConfig', sinon.match.has('CapDrop', ['All'])),
          sinon.match.func
        );
      });
    });

    it('should create a container to run the payload with no network', () => {
      return verifier.verify(client, payload, {imageTag: '2.1.5'}).then(() => {
        sinon.assert.calledWithExactly(
          client.createContainer,
          sinon.match.has('HostConfig', sinon.match.has('NetworkMode', 'none')),
          sinon.match.func
        );
      });
    });

    it('should create a container to run the payload with stdout and sdterr attached', () => {
      return verifier.verify(client, payload, {imageTag: '2.1.5'}).then(() => {
        sinon.assert.calledWithExactly(
          client.createContainer,
          sinon.match.has('AttachStdout', true),
          sinon.match.func
        );
        sinon.assert.calledWithExactly(
          client.createContainer,
          sinon.match.has('AttachStderr', true),
          sinon.match.func
        );
      });
    });

    it('should reject if the container could not be created', () => {
      const error = new Error();

      client.createContainer.yields(error, null);

      return verifier.verify(client, payload).then(
        () =>  Promise.reject(new Error('unexpected')),
        err => expect(err).to.be(error)
      );
    });

    it('should start the container', () => {
      return verifier.verify(client, payload).then(() => {
        sinon.assert.calledOnce(container.start);
        sinon.assert.calledWithExactly(
          container.start,
          sinon.match.object,
          sinon.match.func
        );
      });
    });

    it('should reject and remove the container if it fails to start', () => {
      const err = new Error('failed to start');

      container.start.yields(err, null);

      return verifier.verify(client, payload).then(
        () => Promise.reject(new Error('unexpected')),
        e => {
          expect(e.toString()).to.be(err.toString());
          sinon.assert.calledOnce(container.remove);
          sinon.assert.calledWithExactly(
            container.remove,
            {force: true},
            sinon.match.func
          );
        }
      );
    });

    it('should wait for the container to complete', () => {
      sinon.spy(container, 'wait');

      return verifier.verify(client, payload).then(() => {
        sinon.assert.calledOnce(container.wait);
        sinon.assert.calledWithExactly(container.wait, sinon.match.func);
      });
    });

    it('should reject and remove the container if wait fails', () => {
      const err = new Error('wait failed');

      container.wait = (cb) => {
        stream.end();

        setImmediate(cb, err, null);
      };

      return verifier.verify(client, payload).then(
        () => Promise.reject(new Error('unexpected')),
        e => {
          expect(e.toString()).to.be(err.toString());
          sinon.assert.calledOnce(container.remove);
          sinon.assert.calledWithExactly(
            container.remove,
            {force: true},
            sinon.match.func
          );
        }
      );
    });

    it('should reject and remove container if it times out', () => {
      container.wait = noop;

      return verifier.verify(client, payload, {timeout: 1}).then(
        () => Promise.reject(new Error('unexpected')),
        e => {
          expect(e.message).to.be('Timeout');
          sinon.assert.calledOnce(container.remove);
          sinon.assert.calledWithExactly(
            container.remove,
            {force: true},
            sinon.match.func
          );
        }
      );
    });

  });

});
