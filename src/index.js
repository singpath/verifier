'use strict';

const Docker = require('dockerode');
const log = require('singpath-logger');

const auth = require('./auth');
const images = require('../images.json');
const Queue = require('./queue');
const verifier = require('./verifier');
const firebase = require('./firebase');


exports.auth = auth;
exports.dockerClient = () => Promise.resolve(new Docker());
exports.logger = log;
exports.singpathQueue = singpathQueue;
exports.verify = verifier.verify;
exports.images = images;
exports.firebase = firebase;

/**
 * Singpath Task queue
 * @param  {Firebase}  fbClient     Firebase object pointing the firebase queue.
 * @param  {Dockerode} dockerClient docker client.
 * @return {Queue}
 */
function singpathQueue(fbClient, dockerClient, options) {
  return new Queue(fbClient, dockerClient, options);
}
