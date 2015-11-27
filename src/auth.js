const uuid = require('node-uuid');

/**
 * Return a auth token generator for singpath queue.
 *
 * Can generate a token for a worker or for a user pushing task to the queue.
 *
 * @param  {FirebaseTokenGenerator} generator Firebase db secret.
 * @return {Object}
 */
module.exports = function auth(generator, debug) {
  return {
    /**
     * Generate a custom auth token for a user
     *
     * @param  {String}  uid   optional user uid
     * @param  {Boolean} debug debug rules
     * @return {String}        auth token
     */
    user(uid) {
      return generator.createToken(
        {uid: uid || uuid.v4(), isUser: true},
        {debug: debug || false}
      );
    },

    /**
     * Generate a custom auth token for verifier worker.
     *
     * @param  {String} queueName queue name the worker is allow to work on.
     * @param  {Boolean} debug    debug rules
     * @return {String}           auth token
     */
    worker(queueName) {
      return generator.createToken(
        {uid: uuid.v4(), isWorker: true, queue: queueName},
        {debug: debug || false}
      );
    }
  };
};
