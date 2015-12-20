'use strict';

const Firebase = require('firebase');
const lodashDebounce = require('lodash.debounce');
const once = require('lodash.once');


const noop = () => undefined;

const FIFO = require('./fifo').FIFO;
const verifier = require('./verifier');
const events = require('events');

const DEFAULT_MAX_WORKER = 2;

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
    this.imageTag = options.imageTag;
    this.opts = {
      presenceDelay: options.presenceDelay || DEFAULT_PRESENCE_DELAY,
      taskTimeout: options.taskTimeout || DEFAULT_TASK_TIMEOUT,
      maxWorker: options.maxWorker || DEFAULT_MAX_WORKER
    };

    if (this.opts.maxWorker < 1) {
      this.opts.maxWorker = 1;
    }

    this.queueName = this.ref.key();
    this.singpathRef = this.ref.root().child('singpath');
    this.tasksRef = this.ref.child('tasks');
    this.workersRef = this.ref.child('workers');

    this.tasksToRun = new FIFO();
    this.taskRunning = 0;

    this.authData = undefined;
    this.ref.onAuth(authData => {
      this.authData = authData;

      if (authData && authData.uid) {
        this.emit('loggedIn', authData);
      } else {
        this.emit('loggedOut', authData);
      }
    });
  }

  isLoggedIn() {
    return this.authData && this.authData.uid;
  }

  isWorker() {
    return (
      this.isLoggedIn() &&
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
    if (!this.isLoggedIn()) {
      return Promise.reject(new Error('No user logged in.'));
    }

    return promisedPush(this.tasksRef, {
      started: false,
      completed: false,
      consumed: false,
      owner: this.authData.uid,
      payload: payload,
      createdAt: Firebase.ServerValue.TIMESTAMP
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
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedSet(this.workersRef.child(this.authData.uid), {
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

        if (!this.isWorker()) {
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
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedSet(
      this.workersRef.child(this.authData.uid).child('presence'),
      Firebase.ServerValue.TIMESTAMP
    ).then(
      () => this.logger.info('Worker presence updated')
    ).catch(err => {
      this.logger.error('Failed to update worker presence: %s', err.toString());
      return Promise.reject(err);
    });
  }

  /**
   * Start watching the task queue and workers' presence.
   *
   * Any opened task or opened task added or updated later, should be sheduled
   * to be verified.
   *
   * Any worker craching should be removed from the workers list.
   *
   * Returns a promise resolving when the worker is registered and the watch
   * starts. It will resolve to a fn that will stop the watch when called.
   *
   * Note that you do need not it to call it the auth token expire.
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
        this.logger.error('Watch on new task failed unexpectively: %s', err.toString());
        cancel(err);
      });

      const stopWorkerWatch = this.monitorWorkers(failureHandler);
      const stopPendingTaskWatch = this.monitorPendingTask(failureHandler);

      cancel = (err) => {
        this.emit('watchStopped', err);
        this.logger.info('Watch on new task stopped.');

        return Promise.all([
          deregister, stopWorkerWatch, stopPendingTaskWatch
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

  /**
   * Monitor task queue to shedule any (re)opened task.
   *
   * Any tasks pending in the queue, tasks added and task unclaimed later.
   *
   * @param  {Function} failHandler
   * @return {Function}
   */
  monitorPendingTask(failHandler) {
    const query = this.tasksRef.orderByChild('started').equalTo(false);
    const eventTypes = ['child_added', 'child_changed'];
    const handler = snapshot => this.sheduleTask(snapshot.key(), snapshot.val());

    eventTypes.forEach(type => query.on(type, handler, failHandler));

    return () => {
      return eventTypes.map(type => {
        try {
          return query.off(type, handler);
        } catch (e) {
          this.logger.error(e.toString());
        }
      });
    };
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
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    const language = data && data.payload && data.payload.language;

    if (!verifier.support(language)) {
      this.logger.info('Task ("%s") language ("%s") is not supported', key, language);
      return;
    }

    const lastTry = data && data.tries && data.tries[this.authData.uid];

    if (lastTry) {
      this.logger.info('Already failed to run task. Skipping it (%s).', key);
      return;
    }

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
      () => verifier.verify(this.dockerClient, task.data.payload, {
        logger: this.logger,
        imageTag: this.imageTag
      })
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
      () => this.runTask(this.tasksToRun.shift())
    ).catch(err => {
      this.logger.error(err);

      return Promise.reject(err);
    });
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
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedUpdate(this.tasksRef.child(task.key), {
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
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    const data = {
      worker: null,
      started: false,
      startedAt: null
    };

    if (task.data && task.data.worker) {
      data[`tries/${task.data.worker}`] = Firebase.ServerValue.TIMESTAMP;
    }

    return promisedUpdate(this.tasksRef.child(task.key), data).then(
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
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    let promiseReturn;

    if (task && task.data && task.data.solutionRef) {
      promiseReturn = this.savePushTaskResults(task, results).catch(err => {
        this.logger.error(
          'Failed to save task (%s): %s.\n Retrying to save it as unconsumed',
          task.key,
          err
        );
        return this.savePullTaskResults(task, results);
      });
    } else {
      promiseReturn = this.savePullTaskResults(task, results);
    }

    return promiseReturn.then(
      () => this.logger.info('Task ("%s") results saved.', task.key)
    ).catch(err => {
      this.logger.error('Failed to save task results ("%s"): %s', task.key, err);
      return Promise.reject(err);
    });
  }

  /**
   * Return the a path to the solution relative to /singpath.
   *
   * @param  {string} taskPath
   * @return {string}
   */
  solutionRelativePath(taskPath) {
    const path = taskPath.split('/');

    if (path[0] === 'singpath') {
      return path.slice(1).join('/');
    }

    if (path[0] === '' && path[1] === 'singpath') {
      return path.slice(2).join('/');
    }

    return;
  }

  /**
   * Return a task path relative to /singpath.
   *
   * @param  {string} taskId
   * @return {string}
   */
  taskRelativePath(taskId) {
    return this.tasksRef.path.slice(1).concat([taskId]).join('/');
  }

  /**
   * Save the task result and update the solution meta.
   *
   * @param  {Object} task    task key and data.
   * @param  {Object} results solution results
   * @return {Promise}
   */
  savePushTaskResults(task, results) {
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    if (!task.data.solutionRef) {
      return Promise.reject(new Error('The task is not a Push task'));
    }

    const solutionPath = this.solutionRelativePath(task.data.solutionRef);
    const taskPath = this.taskRelativePath(task.key);

    if (!solutionPath) {
      return Promise.reject(new Error(
        `Invalid relative path to solution (from ${task.data.solutionRef})`
      ));
    }

    return promisedUpdate(this.singpathRef, {
      [`${solutionPath}/results/${task.key}`]: results,
      [`${solutionPath}/meta/verified`]: true,
      [`${solutionPath}/meta/solved`]: results.solved,
      [`${taskPath}/completedAt`]: Firebase.ServerValue.TIMESTAMP,
      [`${taskPath}/completed`]:true,
      [`${taskPath}/consumed`]:true
    });
  }

  /**
   * Save the result with task.
   *
   * Leaves the task as unconsumed.
   *
   * @param  {Object} task    Task key and data
   * @param  {Object} results Task results
   * @return {[Promise}
   */
  savePullTaskResults(task, results) {
    if (!this.isWorker()) {
      return Promise.reject(new Error('The user is not logged in as a worker for this queue'));
    }

    return promisedUpdate(this.tasksRef.child(task.key), {
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
    if (!this.isWorker()) {
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
  monitorWorkers(failureHandler, opts) {
    let cancelWorkerWatch = noop;
    let cancelTaskWatch = noop;

    opts = opts || {};

    const debounce = opts.debounce || lodashDebounce;
    const presenceRef = this.workersRef.child(this.authData.uid).child('presence');
    const presenceHandler = presenceRef.on('value', debounce(snapshot => {
      const now = snapshot.val();
      this.logger.debug('Presence Time: %s', new Date(now));

      cancelWorkerWatch();
      cancelWorkerWatch = this.removeWorkers(now - 2 * this.opts.presenceDelay, failureHandler);

      cancelTaskWatch();
      cancelTaskWatch = this.removeTaskClaims(now - 2 * this.opts.taskTimeout, failureHandler);

    }, 1000), failureHandler);

    return () => {
      [
        () => presenceRef.off('value', presenceHandler),
        cancelWorkerWatch,
        cancelTaskWatch
      ].forEach(fn => {
        try {
          fn();
        } catch (e) {
          this.logger.error(e.toString());
        }
      });
    };
  }

  removeWorkers(olderThan, failureHandler) {
    this.logger.debug('Removing worker older than %s...', new Date(olderThan));

    const query = this.workersRef.orderByChild('presence').endAt(olderThan).limitToFirst(1);
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
    }, failureHandler);

    return () => query.off('child_added', handler);
  }

  removeTaskClaims(claimedBefore, failureHandler) {
    this.logger.debug('Removing claims on task older than %s...', new Date(claimedBefore));

    const query = this.tasksRef.orderByChild('completed').equalTo(false);
    const handler = query.on('child_added', snapshot => {
      const val = snapshot.val();

      if (!val.started || val.startedAt > claimedBefore) {
        return;
      }

      const key = snapshot.key();
      this.logger.debug('Removing old claim on %s...', key);
      this.removeTaskClaim({key});
    }, failureHandler);

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
