/**
 * Singpath service.
 *
 * TODO: refactor queue and verifier to use it.
 * TODO: should be own module to share with other repo.
 *
 */
'use strict';

const auth = require('./auth');
const queues = require('./queues');

/**
 * Singpath service.
 *
 * Wrap the different services related the the singpath firebase DB.
 *
 */
exports.Singpath = class Singpath {

  constructor(firebase) {
    this.$firebase = firebase;
    this.auth = new auth.Auth(firebase);
    this.queues = new queues.Queues(firebase, this.auth);
  }

};

exports.create = (firebase) => new exports.Singpath(firebase);
