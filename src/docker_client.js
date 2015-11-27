'use strict';

const Docker = require('dockerode');
const url = require('url');

const fs = require('./promiseFs');

/**
 * Return a Promise resolving to a dockerode client.
 *
 * @return {Promise}
 */
module.exports = function dockerClient(args) {
  const host = url.parse(args.host);

  if (host.protocol === 'unix:') {
    return localHostClient(host.pathname);
  } else {
    return remoteHostClient(host.hostname, host.port, args);
  }
};

function localHostClient(socketPath) {
  return fs.pathExist(socketPath).then(
    () => new Docker({socketPath})
  );
}

function remoteHostClient(hostname, port, args) {
  if (!hostname || !port) {
    return Promise.reject(new Error('Missing the hostname/port for the remote docker host'));
  }

  return Promise.resolve({
    host: hostname,
    port: port
  }).then(settings => {
    if (!args.tls) {
      settings.protocol = 'http';
      return settings;
    }

    return Promise.all([args.tlscacert, args.tlscert, args.tlskey].map(
      pem => fs.readFile(pem)
    )).then(results => {
      settings.protocol = 'https';
      settings.ca = results[0];
      settings.cert = results[1];
      settings.key = results[2];
      return settings;
    });
  }).then(
    settings => new Docker(settings)
  );
}
