'use strict';

const auth = require('./auth');
const dockerClient = require('./docker_client');
const images = require('../images.json');
const logger = require('./logger');
const Queue = require('./queue');
const verifier = require('./verifier');


exports.auth = auth;
exports.dockerClient = dockerClient;
exports.logger = logger.create;
exports.logger.levels = logger.levels;
exports.singpathQueue = singpathQueue;
exports.verify = verifier.verify;
exports.images = images;

/**
 * Singpath Task queue
 * @param  {Firebase}  fbClient     Firebase object pointing the firebase queue.
 * @param  {Dockerode} dockerClient docker client.
 * @return {Queue}
 */
function singpathQueue(fbClient, dockerClient, options) {
  return new Queue(fbClient, dockerClient, options);
}
