'use strict';

const Writable = require('stream').Writable;

const verifierImages = require('../images.json');

const DELAY = 10000;

/**
 * Writeable stream collecting verifier sdtout stream.
 *
 */
class Response extends Writable {

  constructor(container, stream) {
    super({});
    this.buffer = new Buffer('');

    stream.on('end', () => {
      this.end();
    });

    container.modem.demuxStream(stream, this, process.stderr);
  }

  _write(chunk, encoding, callback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    callback();
  }

  toString() {
    return this.buffer.toString('utf8');
  }

  parse() {
    return JSON.parse(this.toString());
  }
}

/**
 * Error holding refrence to the container the error relate to.
 *
 */
class VerifierError extends Error {

  constructor(error, verifier) {
    super(error.message || error.toString());
    this.verifier = verifier;
    this.error = error;
  }

}

/**
 * Wrapper over dockerode container methods returning Promises
 *
 */
class Verifier {

  /**
   * Verifier constructor.
   *
   * @param  {dockerode.Container} container A container with TTY set to false.
   */
  constructor(container, logger) {
    this.container = container;
    this.out = undefined;
    this.logger = logger;
  }

  /**
   * Warp container method to return a promise.
   *
   * @param  {Function} meth container method to wrap.
   * @param  {Object}   opts options to pass to the method call
   * @return {Promise}
   */
  _wrap(meth, opts) {
    return new Promise((resolve, reject) => {
      const cb = (err, data) => {
        if (err) {
          reject(new VerifierError(err, this));
        } else {
          resolve(data);
        }
      };

      if (opts === undefined) {
        meth.call(this.container, cb);
      } else {
        meth.call(this.container, opts, cb);
      }
    });
  }

  _wrapChain(meth, opts) {
    return this._wrap(meth, opts).then(() => this);
  }

  /**
   * Attach a stream collecting the container stdout into a buffer.
   *
   * @return {Promise} Resolve to the verifier once the the container is
   *                   attached.
   *
   */
  attach() {
    return this._wrap(this.container.attach, {stream: true, stdout: true, stderr: true}).then(stream => {
      this.out = new Response(this.container, stream);
      return this;
    });
  }

  /**
   * Start the container.
   *
   * @return {Promise} Resolve to the verifier once the the container is started.
   */
  start() {
    return this._wrapChain(this.container.start, {});
  }

  /**
   * Stop the container.
   *
   * @return {Promise} Resolve to the verifier once the the container is stopped.
   */
  stop() {
    return this._wrapChain(this.container.stop, {});
  }

  /**
   * Wait for the container to stop for up to the delay argument (in ms).
   *
   * @param  {number} delay
   * @return {Promise}      Resolve when the container stop or reject when the
   *                        delay timeout, which ever first.
   */
  wait(delay) {
    return new Promise((resolve, reject) => {
      let hasTimedOut = false;

      const to = setTimeout(() => {
        hasTimedOut = true;
        this.stop().then(
          () => reject(new VerifierError('Timeout', this)),
          () => reject(new VerifierError('Timeout', this))
        );
      }, delay);

      this.container.wait((err) => {
        if (hasTimedOut) {
          return;
        }

        clearTimeout(to);
        if (err) {
          reject(new VerifierError(err, this));
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * Forces Removal of the container.
   *
   * @return {Promise}
   */
  remove() {
    return this._wrapChain(this.container.remove, {force: true});
  }
}

const support = exports.support = function(lang) {
  return verifierImages[lang] !== undefined;
};

/**
 * Run solution inside a docker container.
 *
 * Returns a promise resolving to the verification result.
 *
 * @param  {Dockerode} client
 * @param  {Object}    payload
 * @return {Promise}
 */
exports.verify = function verify(client, payload, options) {
  if (
    !payload ||
    !payload.language ||
    !support(payload.language)
  ) {
    return Promise.resolve({solved: false, errors: 'Unsupported language'});
  }

  options = options || {};

  const logger = options.logger || console;
  const tag = options.imageTag || 'latest';
  const delay = options.timeout || DELAY;

  return new Promise((resolve, reject) => {
    client.createContainer(containerOptions(payload, tag), (err, container) => {
      if (err) {
        reject(err);
      } else {
        resolve(new Verifier(container, logger));
      }
    });
  }).then(
    verifier => verifier.attach()
  ).then(
    verifier => verifier.start()
  ).then(
    verifier => verifier.wait(delay)
  ).catch(err => {
    if (err.verifier) {
      err.verifier.remove().catch(err => logger.error(err));
    }

    return Promise.reject(err);
  }).then(verifier => {
    verifier.remove().catch(err => logger.error(err));
    return verifier.out.parse();
  });
};

function containerOptions(payload, tag) {
  return {
    'AttachStdin': false,
    'AttachStdout': true,
    'AttachStderr': true,
    'Tty': false,
    'Cmd': ['verify', JSON.stringify({
      'solution': payload.solution,
      'tests': payload.tests
    })],
    'Image': `${verifierImages[payload.language].name}:${tag}`,
    'HostConfig': {
      'CapDrop': ['All'],
      // 'LogConfig': {
      //   'Type': 'syslog',
      //   'Config': {
      //     'tag': `'verifier-${payload.language}'`
      //   }
      // },
      'NetworkMode': 'none'
    }
  };
}
