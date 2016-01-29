/**
 * Singpath queue service.
 */
'use strict';

const ERR_LOGGED_OFF = 'The user is not logged on';

/**
 * Singpath Firebase Queue service.
 *
 * Collection to method to interact with a singpath db queue.
 *
 * @type {Queue}
 */
exports.Queues = class Queues {

  /**
   * @param  {function} firebase factory
   */
  constructor(firebase, auth) {
    this.$firebase = firebase;
    this.$auth = auth;
  }

  _tasksRef(queueId) {
    return this.$firebase(['singpath/queues', queueId, 'tasks']);
  }

  _pushTask(payload, uid, tasksRef) {
    const data = {
      started: false,
      completed: false,
      consumed: false,
      owner: uid,
      payload: payload,
      createdAt: tasksRef.ServerValue.TIMESTAMP
    };
    const ref = tasksRef.push();

    return ref.set(data).then(() => ref);
  }

  /**
   * Push a list of task to a queue.
   *
   * @param  {Object|Array} payloads Array of task payload
   * @param  {String}       queueId  queue id
   * @return {Promise}               Promise resolving to an array of Firebase
   *                                 object; one for each task.
   */
  pushTasks(payloads, queueId) {
    queueId = queueId || 'default';

    const ref = this._tasksRef(queueId);

    return this.$auth.status().take(1).toPromise().then(auth => {
      if (!auth || !auth.uid) {
        return Promise.reject(new Error(ERR_LOGGED_OFF));
      }

      return auth.uid;
    }).then(
      uid => Promise.all(
        [].concat(payloads).map(
          payload => this._pushTask(payload, uid, ref)
        )
      )
    );
  }

  /**
   * Wait for the task to complete, update them as comsumed and return their
   * value.
   *
   * @param  {Object|Array} tasks Firebase object of task to consume
   * @return {Promise}            Resolve to a promise resolving to an array of
   *                              task snapshot.
   */
  consumeTasks(tasks) {
    function isCompleted(snapshot) {
      const val = snapshot.val();
      return val && val.completed;
    }

    function setAsConsumed(snapshot) {
      snapshot.ref().update({consumed: true});
      return snapshot;
    }

    return Promise.all(
      tasks.map(
        ref => ref.observe('value').filter(isCompleted).take(1).toPromise().then(setAsConsumed)
      )
    );
  }
};
