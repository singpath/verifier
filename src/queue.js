'use strict';

const Firebase = require('firebase');
const debounce = require('lodash.debounce');
const once = require('lodash.once');


const noop = () => undefined;

const FIFO = require('./fifo').FIFO;
const verifier = require('./verifier');
const events = require('events');

const DEFAULT_MAX_WORKER = 10;

// TODO: should be saved in FB db and shared between verifiers.
const DEFAULT_PRESENCE_DELAY = 30000;
const DEFAULT_TASK_TIMEOUT = 6000;


module.exports = class Queue extends events.EventEmitter {

  constructor(firebaseClient, dockerClient, options) {
    super();

    options = options || {};

    this.ref = firebaseClient;
    this.dockerClient = dockerClient;
    this.logger = options.logger || console;
    this.opts = {
      presenceDelay: options.presenceDelay || DEFAULT_PRESENCE_DELAY,
      taskTimeout: options.taskTimeout || DEFAULT_TASK_TIMEOUT,
      maxWorker: options.maxWorker || DEFAULT_MAX_WORKER
    };

    this.queueName = this.ref.key();
    this.taskRef = this.ref.child('tasks');
    this.workerRef = this.ref.child('workers');

    this.tasksToRun = new FIFO();
    this.taskRunning = 0;

    this.authData = undefined;
    this.ref.onAuth(authData => {
      this.authData = authData;

      if (authData && authData) {
        this.emit('loggedIn', authData);
      } else {
        this.emit('loggedOut', authData);
      }
    });
  }

  get isLoggedIn() {
    return this.authData && this.authData.uid;
  }

  get isWorker() {
    return (
      this.isLoggedIn &&
      this.authData.auth &&
      this.authData.auth.isWorker &&
      this.authData.auth.queue === this.queueName
    );
  }

  /**
   * Authenticate the firebase client with the custom token.
   *
   * Note only one firebase client per process. You cannot use two firebase
   * client with different token.
   *
   * @param  {string}  token
   * @return {Promise}
   */
  auth(token) {
    return new Promise((resolve, reject) => {
      this.ref.authWithCustomToken(token, (err, authData) => {
        if (err) {
          reject(err);
        } else {
          this.authData = authData;
          resolve(authData);
        }
      });
    });
  }

  /**
   * Push a new task to the firebase queue.
   *
   * To use for developpment.
   *
   * @param  {object}  payload Verification request
   *                           (should include a language, a solution and a test)
   * @return {Promise}         Promise resolving to the new task reference.
   */
  pushToQueue(payload) {
    if (!this.isLoggedIn) {
      return Promise.reject(new Error('No user logged in.'));
    }

    return promisedPush(this.taskRef, {
      started: false,
      completed: false,
      consumed: false,
      owner: this.authData.uid,
      payload: payload
    });
  }

  /**
   * Register a worker for a queue and start a timer to update the worker
   * presence.
   *
   * @return {Promise} Resolve when the worker is registered, to a function to
   *                   deregister it.
   */
  registerWorker() {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedSet(this.workerRef.child(this.authData.uid), {
      startedAt: Firebase.ServerValue.TIMESTAMP,
      presence: Firebase.ServerValue.TIMESTAMP
    }).then(ref => {
      this.logger.info('Worker registered.');

      let timer, stopTimer;

      timer = setInterval(() => {
        this.updatePresence().catch(stopTimer);
      }, this.opts.presenceDelay);

      stopTimer = () => {
        if (timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
          this.logger.debug('Stopping updating presence.');
        }
      };

      return () => {
        stopTimer();

        if (!this.isWorker) {
          return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
        }

        return promisedSet(ref, null).then(() => this.logger.info('Worker removed.'));
      };
    });
  }

  /**
   * Update the worker presence.
   *
   * @return {Promise} Resolve when the presence is updated
   */
  updatePresence() {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedSet(
      this.workerRef.child(this.authData.uid).child('presence'),
      Firebase.ServerValue.TIMESTAMP
    ).then(
      () => this.logger.info('Worker presence updated')
    ).catch(err => {
      this.logger.error('Failed to update worker presence: %s', err.toString());
      return Promise.reject(err);
    });
  }

  /**
   * Start watching the task queue and running opened tasks and any new task
   * added later.
   *
   * Returns a promise resolving when the worker is registered. It will resolve
   * to a fn that will stop the watch when called. Note that you do not it to
   * call it the auth token expire.
   *
   * It will reject if the worker couldn't register itself.
   *
   * To deal with Auth token expiring, you should listen for "watchStopped"
   * event and then restart watching with a new token.
   *
   * @return {Promise}
   */
  watch() {
    return this.registerWorker().then(deregister => {
      let cancel = noop;

      const failureHandler = once(err => {
        this.emit('watchStopped', err);
        this.logger.error('Watch on new task failed unexpectively: %s', err.toString());
        cancel();
      });

      const stopWorkerWatch = this.monitorWorkers(failureHandler);
      const stopAddedTaskWatch = this.monitorAddedTask(failureHandler);
      const stopUpdatedTaskWatch = this.monitorUpdatedTask(failureHandler);

      cancel = () => {
        this.emit('watchStopped');
        this.logger.info('Watch on new task stopped.');

        return Promise.all([
          deregister, stopWorkerWatch, stopAddedTaskWatch, stopUpdatedTaskWatch
        ].map(fn => {
          try {
            return fn();
          } catch (e) {
            return Promise.reject(e);
          }
        }));
      };

      this.emit('watchStarted', cancel);
      this.logger.info('Starting watching for new task.');
      return cancel;
    });
  }

  monitorAddedTask(failHandler) {
    const query = this.taskRef.orderByChild('started').equalTo(false);
    const handler = query.on('child_added', snapshot => {
      this.sheduleTask(snapshot.key(), snapshot.val());
    }, failHandler);

    return () => query.off('child_added', handler);
  }

  monitorUpdatedTask(failHandler) {
    const query = this.taskRef.orderByChild('started').equalTo(false);
    const handler = query.on('child_changed', snapshot => {
      const val = snapshot.val();

      if (val.started) {
        return;
      }

      this.sheduleTask(snapshot.key(), val);
    }, failHandler);

    return () => query.off('child_added', handler);
  }

  /**
   * Schedule run of a new task.
   *
   * The task will be run immedialy or enqueue if if there are to many concurent
   * task running.
   *
   * @param  {string} key  Task id
   * @param  {Object} data Task body
   */
  sheduleTask(key, data) {
    this.tasksToRun.push({key, data});
    this.logger.info('Task ("%s") run scheduled', key);
    this.logger.debug('Task ("%s") run scheduled with "%j"', key, data);

    if (this.taskRunning >= this.opts.maxWorker) {
      return;
    }

    this.runTask(this.tasksToRun.shift());
  }

  /**
   * Async. run a task until the queue is empty.
   *
   * @param  {Object} task Task key and body.
   * @return {Promise}     Resolve when the queue is empty.
   */
  runTask(task) {
    if (!task) {
      return Promise.resolve();
    }

    const skip = {};

    this.taskRunning++;
    return this.claimTask(task).catch(
      () => Promise.reject(skip)
    ).then(
      () => verifier.verify(this.dockerClient, task.data.payload, {logger: this.logger})
    ).then(results => {
      this.logger.info('Task ("%s") run.', task.key);
      this.logger.debug('Task ("%s") run: "%j".', task.key, results);
      return this.saveTaskResults(task, results);
    }).catch(err => {
      if (err === skip) {
        return;
      }

      this.logger.info('Task ("%s") failed running: %s.\n%s', task.key, err.toString(), err.stack);
      return this.removeTaskClaim(task);
    }).then(
      // Regardless of promise settlement, recover and decrease task running count.
      () => this.taskRunning--,
      () => this.taskRunning--
    ).then(
      () => this.run(this.tasksToRun.shift())
    );

  }

  /**
   * Claim a task.
   *
   * Resolve when the task is claimed.
   *
   * @param  {Object} task Task key and body.
   * @return {Promise}     Resolve when the
   */
  claimTask(task) {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedUpdate(this.taskRef.child(task.key), {
      worker: this.authData.uid,
      started: true,
      startedAt: Firebase.ServerValue.TIMESTAMP
    }).then(
      () => this.logger.info('Task ("%s") claimed.', task.key)
    ).catch(err => {
      this.logger.debug('Failed to claim task ("%s"): %s', task.key, err.toString());
      return Promise.reject(err);
    });
  }

  /**
   * Remove claim on a task
   *
   * @param  {Object} task Task key and body
   * @return {Promise}     Resolve when claim is removed.
   */
  removeTaskClaim(task) {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedUpdate(this.taskRef.child(task.key), {
      worker: null,
      started: false,
      startedAt: null
    }).then(
      () => this.logger.info('Task ("%s") claim removed.', task.key)
    ).catch(err => {
      this.logger.error('Failed to remove task claim("%s"): %s', task.key, err.toString());
      return Promise.reject(err);
    });
  }

  /**
   * Save task result to firebase DB.
   *
   * @param  {Object} task    Task key and body.
   * @param  {Object} results Task result.
   * @return {Promise}        Resolve when result is saved.
   */
  saveTaskResults(task, results) {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    let promiseReturn;

    if (task && task.data && task.data.solutionRef) {
      promiseReturn = this.savePushTaskResults(task, results);
    } else {
      promiseReturn = this.savePullTaskResults(task, results);
    }

    return promiseReturn.then(
      () => this.logger.info('Task ("%s") results saved.', task.key)
    ).catch(err => {
      this.logger.error('Failed to save task results("%s"): %s', task.key, err.toString());
      return Promise.reject(err);
    });
  }

  solutionRefMaker(task) {
    return this.ref.parent().parent().parent().child(task.solutionRef);
  }

  savePushTaskResults(task, results) {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    if (!task.data.solutionRef) {
      return Promise.reject(new Error('The task is not a Push task'));
    }

    return promisedUpdate(this.solutionRefMaker(task.data), {
      ['results/' + task.key]: results,
      'meta/verified': true,
      'meta/solved': results.solved
    }).then(() => {
      return promisedUpdate(this.taskRef.child(task.key), {
        completedAt: Firebase.ServerValue.TIMESTAMP,
        completed: true,
        consumed: true
      });
    });
  }

  savePullTaskResults(task, results) {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedUpdate(this.taskRef.child(task.key), {
      results: results,
      completedAt: Firebase.ServerValue.TIMESTAMP,
      completed: true
    });
  }

  /**
   * Remove any claim on the task in the queue and reset it.
   *
   * TODO: remove old client and old claim.
   *
   * @return {Promise}.
   */
  reset() {
    if (!this.isWorker) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    this.tasksToRun.reset();
    return Promise.resolve();
  }

  /**
   * Watch for worker failing to update their presence or to unclaim task.
   *
   * It will actually watch for worker which presence is older than this
   * worker presence time (plus a margin); we cannot use the worker current time
   * which could get out of sync.
   *
   * @return {Function} function to cancel monitoring
   */
  monitorWorkers() {
    let cancelWorkerWatch = noop;
    let cancelTaskWatch = noop;

    const presenceRef = this.workerRef.child(this.authData.uid).child('presence');
    const presenceHandler = presenceRef.on('value', debounce(snapshot => {
      const now = snapshot.val();
      this.logger.debug('Presence Time: %s', new Date(now));

      cancelWorkerWatch();
      cancelWorkerWatch = this.removeWorker(now - 2 * this.opts.presenceDelay);

      cancelTaskWatch();
      cancelTaskWatch = this.removeTaskClaims(now - 2 * this.opts.taskTimeout);

    }, 1000));

    return () => {
      presenceRef.off('value', presenceHandler);
      cancelWorkerWatch();
      cancelTaskWatch();
    };
  }

  removeWorker(olderThan) {
    this.logger.debug('Removing worker older than %s...', new Date(olderThan));

    const query = this.workerRef.orderByChild('presence').endAt(olderThan).limitToFirst(1);
    const handler = query.on('child_added', snapshot => {
      const key = snapshot.key();

      this.logger.debug('Removing old worker %s...', key);

      snapshot.ref().remove(err => {
        if (err) {
          this.logger.error('Failed to remove worker "%s": %s', key, err.toString());
        } else {
          this.logger.info('Worker "%s" removed', key);
        }
      });
    });

    return () => query.off('child_added', handler);
  }

  removeTaskClaims(claimedBefore) {
    this.logger.debug('Removing claims on task older than %s...', new Date(claimedBefore));

    const query = this.taskRef.orderByChild('completed').equalTo(false);
    const handler = query.on('child_added', snapshot => {
      const val = snapshot.val();

      if (!val.started || val.startedAt > claimedBefore) {
        return;
      }

      const key = snapshot.key();
      this.logger.debug('Removing old claim on %s...', key);
      this.removeTaskClaim({key});
    });

    return () => query.off('child_added', handler);
  }

};


function promisedPush(ref, data) {
  try {
    return promisedSet(ref.push(), data);
  } catch (e) {
    // in case ref.push throw.
    return Promise.reject(e);
  }
}

function promisedSet(ref, data) {
  return new Promise((resolve, reject) => {
    ref.set(data, err => {
      if (err) {
        reject(err);
      } else {
        resolve(ref);
      }
    });
  });
}

function promisedUpdate(ref, data) {
  return new Promise((resolve, reject) => {
    ref.update(data, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(ref);
      }
    });
  });
}
