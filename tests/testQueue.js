'use strict';

const expect = require('expect.js');
const sinon = require('sinon');
const Firebase = require('firebase');

const verifier = require('../');
const verifierComponent = require('../src/verifier');

const noop = () => undefined;
const unexpected = () => Promise.reject(new Error('Unexpected'));

describe('queue', () => {
  let firebaseClient, queue, dockerClient;
  let workersRef, singpathRef, tasksRef, someTaskRef, rootRef;

  beforeEach(() => {
    workersRef = {};
    const logger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub()
    };

    singpathRef = {
      update: sinon.stub().yields(null)
    };

    rootRef = {child: sinon.stub()};
    rootRef.child.withArgs('singpath').returns(singpathRef);

    someTaskRef = {
      update: sinon.stub().yields(null)
    };

    tasksRef = {
      child: sinon.stub().returns(someTaskRef),
      push: sinon.stub()
    };
    tasksRef.path = ['singpath', 'queues', 'default', 'tasks'];

    firebaseClient = {
      key: sinon.stub().returns('default'),
      root: sinon.stub().returns(rootRef),
      child: sinon.stub(),
      onAuth: sinon.stub()
    };

    firebaseClient.child.withArgs('tasks').returns(tasksRef);
    firebaseClient.child.withArgs('workers').returns(workersRef);

    dockerClient = {};
    queue = verifier.singpathQueue(firebaseClient, dockerClient, {logger});
    queue.authData = {
      uid: 'someWorker',
      auth: {
        uid: 'someWorker',
        isWorker: 'true',
        queue: 'default'
      }
    };
  });

  it('should set max worker to default value', () => {
    expect(
      verifier.singpathQueue(firebaseClient, dockerClient).opts.maxWorker
    ).to.be(2);
  });

  it('should set max worker to the provided option value', () => {
    const maxWorker = 5;

    expect(
      verifier.singpathQueue(firebaseClient, dockerClient, {maxWorker}).opts.maxWorker
    ).to.be(maxWorker);
  });

  it('should set max worker to 1+', () => {
    const maxWorker = -1;

    expect(
      verifier.singpathQueue(firebaseClient, dockerClient, {maxWorker}).opts.maxWorker
    ).to.be(1);
  });

  it('should set singpathRef property', () => {
    expect(queue.singpathRef).to.be(singpathRef);
  });

  it('should set taskRef property', () => {
    expect(queue.tasksRef).to.be(tasksRef);
  });

  it('should monitor authentication', () => {
    sinon.assert.calledOnce(firebaseClient.onAuth);
    sinon.assert.calledWithExactly(firebaseClient.onAuth, sinon.match.func);

    const data = {uid: 'someone'};
    const cb = firebaseClient.onAuth.lastCall.args[0];

    cb(data);
    expect(queue.authData).to.be(data);
  });

  it('should emit a loggedIn event if authData are set', done => {
    const data = {uid: 'someone'};
    const cb = firebaseClient.onAuth.lastCall.args[0];

    queue.on('loggedIn', authData => {
      expect(authData).to.be(data);
      done();
    });

    cb(data);
  });

  it('should emit a loggedOut event if authData are not set', done => {
    const data = undefined;
    const cb = firebaseClient.onAuth.lastCall.args[0];

    queue.on('loggedOut', authData => {
      expect(authData).to.be(undefined);
      done();
    });

    cb(data);
  });

  it('should set workersRef attribute', () => {
    expect(queue.workersRef).to.be(workersRef);
  });

  describe('isWorker', () => {

    beforeEach(() => {
      sinon.stub(queue, 'isLoggedIn').returns(true);
      queue.authData = {auth: {isWorker: true, queue: 'default'}};
    });

    it('should return false if the user is not logged in', () => {
      queue.isLoggedIn.returns(false);
      expect(queue.isWorker()).to.be(false);
    });

    it('should return false if the user is not a worker', () => {
      queue.authData.auth.isWorker = false;
      expect(queue.isWorker()).to.be(false);
    });

    it('should return false if the user is a worker for an other queue', () => {
      queue.authData.auth.queue = 'my-queue';
      expect(queue.isWorker()).to.be(false);
    });

    it('should return true if the user is a worker for the correct queue', () => {
      expect(queue.isWorker()).to.be(true);
    });

  });

  describe('auth', () => {
    let authData;

    beforeEach(() => {
      authData = {};
      queue.ref.authWithCustomToken = sinon.stub().yields(null, authData);
    });

    it('should authentication user', () => {
      return queue.auth('some-token').then(data => {
        expect(data).to.be(authData);
        expect(queue.authData).to.be(data);
      });
    });

    it('should authentication user using a token', () => {
      return queue.auth('some-token').then(() => {
        sinon.assert.calledWithExactly(
          queue.ref.authWithCustomToken,
          'some-token',
          sinon.match.func
        );
      });
    });

    it('should reject if authentication failed', () => {
      const err = new Error();

      queue.ref.authWithCustomToken.yields(err, null);

      return queue.auth('some-token').then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

  });

  describe('pushToQueue', () => {
    let payload, newTaskRef;

    beforeEach(() => {
      queue.authData = {
        uid: 'someUser',
        authData: {
          isUser: true
        }
      };

      payload = {};

      newTaskRef = {set: sinon.stub().yields(null)};
      queue.tasksRef.push.returns(newTaskRef);
    });

    it('should push a task to the task queue', () => {
      return queue.pushToQueue(payload).then(() => {
        sinon.assert.calledOnce(queue.tasksRef.push);
        sinon.assert.calledOnce(newTaskRef.set);
        sinon.assert.calledWithExactly(
          newTaskRef.set,
          sinon.match(data => {
            return (
              Object.keys(data).length === 6 &&
              sinon.match({
                owner: 'someUser',
                payload: payload,
                started: false,
                completed: false,
                consumed: false,
                createdAt: Firebase.ServerValue.TIMESTAMP
              }, data)
            );
          }),
          sinon.match.func
        );
      });
    });

    it('should reject if the user is not logged in', () => {
      queue.authData = null;
      return queue.pushToQueue(payload).then(
        () => Promise.reject(new Error('Unexpected')),
        () => undefined
      );
    });

  });

  describe('updatePresence', () => {
    let workerRef, presenceRef;

    beforeEach(() => {
      presenceRef = {set: sinon.stub().yields(null)};
      workerRef = {child: sinon.stub().withArgs('presence').returns(presenceRef)};
      queue.workersRef.child = sinon.stub().withArgs('someWorker').returns(workerRef);
    });

    it('should update the worker presence', () => {
      return queue.updatePresence().then(() => {
        sinon.assert.calledOnce(presenceRef.set);
        sinon.assert.calledWithExactly(
          presenceRef.set, Firebase.ServerValue.TIMESTAMP, sinon.match.func
        );
      });
    });

    it('should reject if the user is not logged in', () => {
      queue.authData = undefined;

      return queue.updatePresence().then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should reject if the user is not a worker', () => {
      queue.authData.auth.isWorker = false;

      return queue.updatePresence().then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should reject if the presence update failed', () => {
      const err = new Error('Some permission error');

      presenceRef.set.yields(err);

      return queue.updatePresence().then(
        () => Promise.reject(new Error('unexpected')),
        e => expect(e).to.be(err)
      );
    });

  });

  describe('watch', () => {
    let deregister, stopWatchOnWorker, monitorPendingTask;

    beforeEach(() => {
      deregister = sinon.stub();
      stopWatchOnWorker = sinon.stub();
      monitorPendingTask = sinon.stub();

      sinon.stub(queue, 'registerWorker').returns(Promise.resolve(deregister));
      sinon.stub(queue, 'monitorWorkers').returns(stopWatchOnWorker);
      sinon.stub(queue, 'monitorPendingTask').returns(monitorPendingTask);
      sinon.stub(queue, 'reset').returns(Promise.resolve());
    });

    it('should register the worker', () => {
      return queue.watch().then(() => {
        sinon.assert.calledOnce(queue.registerWorker);
      });
    });

    it('should start monitoring workers presence', () => {
      return queue.watch().then(() => {
        sinon.assert.calledOnce(queue.monitorWorkers);
        sinon.assert.calledWithExactly(queue.monitorWorkers, sinon.match.func);
      });
    });

    it('should start monitoring opened task', () => {
      return queue.watch().then(() => {
        sinon.assert.calledOnce(queue.monitorPendingTask);
        sinon.assert.calledWithExactly(queue.monitorPendingTask, sinon.match.func);
      });
    });

    it('should let the watch be cancelled', () => {
      return queue.watch().then(cancel => {
        expect(cancel).to.be.an(Function);

        return cancel();
      }).then(() => {
        sinon.assert.calledOnce(deregister);
        sinon.assert.calledOnce(stopWatchOnWorker);
        sinon.assert.calledOnce(monitorPendingTask);
      });
    });

    it('should cancel the watch if one of the watch fails', () => {
      return queue.watch().then(() => {
        const failureCb = queue.monitorWorkers.lastCall.args[0];

        failureCb(new Error());

        sinon.assert.calledOnce(deregister);
        sinon.assert.calledOnce(stopWatchOnWorker);
        sinon.assert.calledOnce(monitorPendingTask);
      });
    });

    it('should cancel the watch once even if many of the watches fails', done => {
      // will fail if called more than once
      queue.on('watchStopped', () => done());

      queue.watch().then(() => {
        [queue.monitorWorkers, queue.monitorPendingTask].forEach(
          watcher => {
            const failureCb = watcher.lastCall.args[0];
            failureCb(new Error());
          }
        );
      });
    });

    describe('cancel handler', () => {

      it('should reject if cancellation failed', () => {
        deregister.returns(Promise.reject(new Error('failed to deregister')));

        return queue.watch().then(cancel => {
          return cancel();
        }).then(
          () => Promise.reject(new Error('unexpected')),
          () => undefined
        );
      });

      it('should cancel all watch even one cancellation fails', () => {
        deregister.returns(Promise.reject(new Error('failed to deregister')));
        stopWatchOnWorker.throws(new Error('falied to stop watch'));
        monitorPendingTask.throws(new Error('falied to stop watch'));

        return queue.watch().then(cancel => {
          return cancel();
        }).then(
          () => Promise.reject(new Error('unexpected')),
          () => {
            sinon.assert.calledOnce(deregister);
            sinon.assert.calledOnce(stopWatchOnWorker);
            sinon.assert.calledOnce(monitorPendingTask);
          }
        );
      });

      it('should fire a watchStopped event', done => {
        queue.on('watchStopped', () => done());

        queue.watch().then(cancel => {
          return cancel();
        });
      });

      it('should reset the in-memory queue', () => {
        return queue.watch().then(cancel => {
          return cancel();
        }).then(
          () => sinon.assert.calledOnce(queue.reset)
        );
      });

      it('should reject if reset rejected', () => {
        const err = new Error();

        queue.reset.returns(Promise.reject(err));

        return queue.watch().then(cancel => {
          return cancel();
        }).then(
          unexpected,
          e => expect(e).to.be(err)
        );
      });

    });

  });

  describe('registerWorker', () => {
    let timer, workerRef;

    beforeEach(() => {
      timer = {
        start: sinon.stub().returns(1),
        cancel: sinon.spy()
      };

      workerRef = {
        set: sinon.stub().yields(null)
      };
      queue.workersRef.child = sinon.stub().withArgs('someWorker').returns(workerRef);

      sinon.stub(queue, 'updatePresence').returns(Promise.resolve());
    });

    it('should register the worker', () => {
      return queue.registerWorker({timer}).then(() => {
        sinon.assert.calledOnce(queue.workersRef.child);
        sinon.assert.calledOnce(workerRef.set);
        sinon.assert.calledOnce(workerRef.set, sinon.match({
          'startedAt': Firebase.ServerValue.TIMESTAMP,
          'presence': Firebase.ServerValue.TIMESTAMP
        }));
      });
    });

    it('should reject if the user is not a worker', () => {
      queue.authData.auth.isWorker = false;
      return queue.registerWorker({timer}).then(unexpected, noop);
    });

    it('should update presence at regular interval', () => {
      queue.opts.presenceDelay = 5000;

      return queue.registerWorker({timer}).then(() => {
        sinon.assert.calledOnce(timer.start);
        sinon.assert.calledOnce(timer.start, sinon.match.func, 5000);

        timer.start.callArg(0);
        sinon.assert.calledOnce(queue.updatePresence);
        timer.start.callArg(0);
        sinon.assert.calledTwice(queue.updatePresence);
      });
    });

    it('should stop updating the worker presence after an update fails', () => {
      queue.updatePresence.returns(Promise.reject(new Error()));

      return queue.registerWorker({timer}).then(() => {
        timer.start.callArg(0);

        return poll(() => timer.cancel.called, 10);
      }).then(() => {
        sinon.assert.calledOnce(timer.cancel);
        sinon.assert.calledWithExactly(timer.cancel, 1);
      });
    });

    it('should allow the presence update to be cancelled', () => {
      return queue.registerWorker({timer}).then(cancel => {
        cancel();

        sinon.assert.calledOnce(timer.cancel);
        sinon.assert.calledWithExactly(timer.cancel, 1);
      });
    });

    it('should reject the cancellation if the user is not worker', () => {
      return queue.registerWorker({timer}).then(cancel => {
        queue.authData.auth.isWorker = false;
        workerRef.set = sinon.stub().yields(null);
        return cancel();
      }).then(
        unexpected,
        () => {
          // cancel timer but do not try to removethe worker
          sinon.assert.calledOnce(timer.cancel);
          sinon.assert.notCalled(workerRef.set);
        }
      );
    });

    it('should allow the worker to be removed from the queue (if the user is a worker)', () => {
      return queue.registerWorker({timer}).then(cancel => {
        workerRef.set = sinon.stub().yields(null);
        return cancel();
      }).then(() => {
        sinon.assert.calledOnce(workerRef.set);
        sinon.assert.calledWithExactly(workerRef.set, null, sinon.match.func);
      });
    });

    it('should reject if the worker removal failed', () => {
      const err = new Error();

      return queue.registerWorker({timer}).then(cancel => {
        workerRef.set = sinon.stub().yields(err);
        return cancel();
      }).then(
        unexpected,
        e => expect(e).to.be(err)
      );
    });

  });

  describe('monitorWorkers', () => {
    let failCb, workerRef, presenceRef, debounce, presenceSnapshot;
    let cancelRemoveWorkers;
    let cancelRemoveTaskClaims;

    beforeEach(() => {
      failCb = sinon.spy();

      presenceSnapshot = {val: sinon.stub().returns(12345000)};
      presenceRef = {
        on: sinon.stub(),
        off: sinon.stub()
      };
      presenceRef.on.withArgs('value').yields(presenceSnapshot);
      presenceRef.on.withArgs('value').returnsArg(1);
      workerRef = {child: sinon.stub().withArgs('presence').returns(presenceRef)};
      queue.workersRef.child = sinon.stub().withArgs('someWorker').returns(workerRef);

      cancelRemoveWorkers = sinon.stub();
      cancelRemoveTaskClaims = sinon.stub();
      sinon.stub(queue, 'removeWorkers').returns(cancelRemoveWorkers);
      sinon.stub(queue, 'removeTaskClaims').returns(cancelRemoveTaskClaims);

      debounce = sinon.stub().returnsArg(0);

      queue.opts = {
        presenceDelay: 500,
        taskTimeout: 1000
      };
    });

    it('should remove old works each time the worker update its own presence', () => {
      queue.monitorWorkers(failCb, {debounce});
      sinon.assert.calledOnce(queue.removeWorkers);
      sinon.assert.calledWithExactly(queue.removeWorkers, 12344000, failCb);
    });

    it('should remove old task claim each time the worker update its own presence', () => {
      queue.monitorWorkers(failCb, {debounce});
      sinon.assert.calledOnce(queue.removeTaskClaims);
      sinon.assert.calledWithExactly(queue.removeTaskClaims, 12343000, failCb);
    });

    it('should let the watch be cancelled', () => {
      const cancel = queue.monitorWorkers(failCb, {debounce});
      const presenceUpdateCb = presenceRef.on.lastCall.args[1];

      cancel();
      sinon.assert.calledOnce(cancelRemoveWorkers);
      sinon.assert.calledOnce(cancelRemoveTaskClaims);
      sinon.assert.calledOnce(presenceRef.off);
      sinon.assert.calledWithExactly(presenceRef.off, 'value', presenceUpdateCb);
    });

    it('should let all the watch be cancelled even if one of them throws', () => {
      const cancel = queue.monitorWorkers(failCb, {debounce});

      cancelRemoveWorkers.throws();
      cancelRemoveTaskClaims.throws();
      presenceRef.off.throws();

      cancel();
      sinon.assert.calledOnce(cancelRemoveWorkers);
      sinon.assert.calledOnce(cancelRemoveTaskClaims);
      sinon.assert.calledOnce(presenceRef.off);
    });

  });

  describe('monitorPendingTask', () => {
    let failureHandler, query;

    beforeEach(() => {
      failureHandler = sinon.stub();
      query = {
        equalTo: sinon.stub().returnsThis(),
        on: sinon.stub().returnsArg(1),
        off: sinon.stub()
      };

      queue.tasksRef.orderByChild = sinon.stub().returns(query);
    });

    it('should watch for any task opening', () => {
      queue.monitorPendingTask(failureHandler);
      sinon.assert.calledOnce(queue.tasksRef.orderByChild);
      sinon.assert.calledWithExactly(
        queue.tasksRef.orderByChild, 'started'
      );
      sinon.assert.calledOnce(query.equalTo);
      sinon.assert.calledWithExactly(query.equalTo, false);
      sinon.assert.calledTwice(query.on);
      sinon.assert.calledWithExactly(
        query.on, 'child_added', sinon.match.func, sinon.match.func
      );
      sinon.assert.calledWithExactly(
        query.on, 'child_changed', sinon.match.func, sinon.match.func
      );
    });

    it('should shedule the opened task', done => {
      const key = 'someTaskKey';
      const data = {started: false};
      const snapshot = {
        key: () => key,
        val: () => data
      };
      let expectedShedulesTask = 2;

      queue.sheduleTask = (key, data) => {
        expect(key).to.be(key);
        expect(data).to.be(data);

        if (--expectedShedulesTask === 0) {
          done();
        }
      };
      sinon.spy(queue, 'sheduleTask');

      queue.monitorPendingTask(failureHandler);

      const addedValueCb = query.on.firstCall.args[1];
      const updatedValueCb = query.on.lastCall.args[1];
      addedValueCb(snapshot);
      updatedValueCb(snapshot);
    });

    it('should let the watch be cancelled', () => {
      const cancel = queue.monitorPendingTask(failureHandler);
      const addedValueCb = query.on.lastCall.args[1];

      cancel();

      sinon.assert.calledTwice(query.off);
      sinon.assert.calledWithExactly(query.off, 'child_added', addedValueCb);
      sinon.assert.calledWithExactly(query.off, 'child_changed', addedValueCb);
    });

    it('should let cancelled any watch even if one throws', () => {
      const cancel = queue.monitorPendingTask(failureHandler);
      const addedValueCb = query.on.firstCall.args[1];
      const updatedValueCb = query.on.lastCall.args[1];

      query.off.throws();
      cancel();

      sinon.assert.calledTwice(query.off);
      sinon.assert.calledWithExactly(query.off, 'child_added', addedValueCb);
      sinon.assert.calledWithExactly(query.off, 'child_changed', updatedValueCb);
    });

  });

  describe('solutionRelativePath', () => {

    ['', '/'].map(start => {
      const solutionRef = start + 'singpath/queuedSolution/some/where';
      const expected = 'queuedSolution/some/where';

      it('should return a path relative to singpath', () => {
        expect(queue.solutionRelativePath(solutionRef)).to.be(expected);
      });
    });

    it('should return an undefined when the path not a /singpath child', () => {
      const solutionRef = 'classMentor/queuedSolution/some/where';

      expect(queue.solutionRelativePath(solutionRef)).to.be(undefined);
    });

  });

  describe('taskRelativePath', () => {

    it('should return a path relative to singpath', () => {
      expect(
        queue.taskRelativePath('someTaskId')
      ).to.be(
        'queues/default/tasks/someTaskId'
      );
    });

  });

  describe('savePushTaskResults', () => {
    let task, results;

    beforeEach(() => {
      task = {
        key: 'someTaskId',
        data: {
          solutionRef: 'singpath/queuedSolution/some/where'
        }
      };
      results = {
        solved: true
      };
      sinon.stub(queue, 'isWorker').returns(true);
    });

    it('should reject if the user is not a worker', () => {
      queue.isWorker.returns(false);

      return queue.savePushTaskResults(task, results).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should reject if the task has no solutionRef', () => {
      task.data.solutionRef = undefined;

      return queue.savePushTaskResults(task, results).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should reject if the task solutionRef is invalid', () => {
      task.data.solutionRef = 'some/where';

      return queue.savePushTaskResults(task, results).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should update the solution with the task result', () => {
      return queue.savePushTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(singpathRef.update);
        sinon.assert.calledWithExactly(
          singpathRef.update,
          sinon.match({
            'queuedSolution/some/where/meta/verified': true,
            'queuedSolution/some/where/meta/solved': true,
            'queuedSolution/some/where/results/someTaskId': results
          }),
          sinon.match.func
        );
      });
    });

    it('should update the task as completed and consumed', () => {
      return queue.savePushTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(singpathRef.update);
        sinon.assert.calledWithExactly(
          singpathRef.update,
          sinon.match({
            'queues/default/tasks/someTaskId/completed': true,
            'queues/default/tasks/someTaskId/completedAt': Firebase.ServerValue.TIMESTAMP,
            'queues/default/tasks/someTaskId/consumed': true
          }),
          sinon.match.func
        );
      });
    });

  });

  describe('savePullTaskResults', () => {
    let task, results;

    beforeEach(() => {
      task = {
        key: 'someTaskId',
        data: {}
      };
      results = {
        solved: true
      };
      sinon.stub(queue, 'isWorker').returns(true);
    });

    it('should update the task as completed', () => {
      return queue.savePullTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.tasksRef.child);
        sinon.assert.calledWithExactly(queue.tasksRef.child,'someTaskId');

        sinon.assert.calledOnce(someTaskRef.update);
        sinon.assert.calledWithExactly(
          someTaskRef.update,
          sinon.match({
            'completed': true,
            'completedAt': Firebase.ServerValue.TIMESTAMP
          }),
          sinon.match.func
        );

      });
    });

    it('should save the result with the task', () => {
      return queue.savePullTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.tasksRef.child);
        sinon.assert.calledWithExactly(queue.tasksRef.child,'someTaskId');

        sinon.assert.calledOnce(someTaskRef.update);
        sinon.assert.calledWithExactly(
          someTaskRef.update,
          sinon.match({results}),
          sinon.match.func
        );
      });
    });

    it('should reject if the user is not a worker', () => {
      queue.isWorker.returns(false);

      return queue.savePullTaskResults(task, results).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

  });

  describe('saveTaskResults', () => {
    let task, results;

    beforeEach(() => {
      task = {data: {}};
      results = {};

      sinon.stub(queue, 'isWorker').returns(true);
      sinon.stub(queue, 'savePullTaskResults').returns(Promise.resolve());
      sinon.stub(queue, 'savePushTaskResults').returns(Promise.resolve());
    });

    it('should reject if the user is not a worker', () => {
      queue.isWorker.returns(false);
      return queue.saveTaskResults(task, results).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should save results with the tasks', () => {
      return queue.saveTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.savePullTaskResults);
        sinon.assert.notCalled(queue.savePushTaskResults);
      });
    });

    it('should save the result with the solution', () => {
      task.data.solutionRef = 'singpath/queuedSolution/some/where';

      return queue.saveTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.savePushTaskResults);
        sinon.assert.notCalled(queue.savePullTaskResults);
      });
    });

    it('should save the result with the task if it fails to save them with the solution', () => {
      task.data.solutionRef = 'singpath/queuedSolution/some/where';
      queue.savePushTaskResults.returns(Promise.reject());

      return queue.saveTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.savePushTaskResults);
        sinon.assert.calledOnce(queue.savePullTaskResults);
      });
    });

    it('should reject if it failed to save the results', () => {
      task.data.solutionRef = 'singpath/queuedSolution/some/where';
      queue.savePushTaskResults.returns(Promise.reject());
      queue.savePullTaskResults.returns(Promise.reject());

      return queue.saveTaskResults(task, results).then(unexpected, noop);
    });

  });

  describe('runTask', () => {
    let key, data, results, task;

    beforeEach(() => {
      key = 'someKey';
      data = {payload: {}};
      task = {key, data};
      results = {solved: false};

      sinon.stub(queue, 'claimTask').returns(Promise.resolve());
      sinon.stub(verifierComponent, 'verify').returns(Promise.resolve(results));
      sinon.stub(queue, 'saveTaskResults').withArgs(
        sinon.match.object, results
      ).returns(Promise.resolve(results));
      sinon.stub(queue, 'removeTaskClaim').returns(Promise.resolve());
    });

    afterEach(() => {
      verifierComponent.verify.restore();
    });

    it('should run the task', () => {
      return queue.runTask(task).then(actualResults => {
        expect(actualResults).to.be(results);
      });
    });

    it('should claim the task', () => {
      return queue.runTask({key, data}).then(() => {
        sinon.assert.calledOnce(queue.claimTask);
        sinon.assert.calledWithExactly(queue.claimTask, task);
      });
    });

    it('should resolve to undefined if it fails to claim the task', () => {
      queue.claimTask.returns(Promise.reject(new Error()));

      return queue.runTask({key, data}).then(
        results => expect(results).to.be(undefined)
      );
    });

    it('should verify the task', () => {
      queue.imageTag = '2.2.0';

      return queue.runTask({key, data}).then(() => {
        sinon.assert.calledOnce(verifierComponent.verify);
        sinon.assert.callOrder(queue.claimTask, verifierComponent.verify);
        sinon.assert.calledWithExactly(
          verifierComponent.verify,
          queue.dockerClient,
          data.payload,
          sinon.match.has('imageTag', '2.2.0')
        );
      });
    });

    it('should reject if it fails to verify the task', () => {
      const err = new Error();

      verifierComponent.verify.returns(Promise.reject(err));

      return queue.runTask({key, data}).then(
        unexpected,
        e => expect(e).to.be(err)
      );
    });

    it('should remove claim if it fails to verify the task', () => {
      verifierComponent.verify.returns(Promise.reject(new Error()));

      return queue.runTask({key, data}).then(unexpected, noop).then(() => {
        sinon.assert.calledOnce(queue.removeTaskClaim);
        sinon.assert.callOrder(verifierComponent.verify, queue.removeTaskClaim);
        sinon.assert.calledWithExactly(queue.removeTaskClaim, task);
      });
    });

    it('should save the task result', () => {
      return queue.runTask({key, data}).then(() => {
        sinon.assert.calledOnce(queue.saveTaskResults);
        sinon.assert.callOrder(verifierComponent.verify, queue.saveTaskResults);
        sinon.assert.calledWithExactly(queue.saveTaskResults, task, results);
      });
    });

    it('should reject if it fails to save the results', () => {
      const err = new Error();

      queue.saveTaskResults.withArgs(sinon.match.object, results).returns(
        Promise.reject(err)
      );

      return queue.runTask({key, data}).then(
        unexpected,
        e => expect(e).to.be(err)
      );
    });

    it('should remove claim if it fails to save the results', () => {
      queue.saveTaskResults.withArgs(sinon.match.object, results).returns(
        Promise.reject(new Error())
      );

      return queue.runTask({key, data}).then(unexpected, noop).then(() => {
        sinon.assert.calledOnce(queue.removeTaskClaim);
        sinon.assert.callOrder(queue.saveTaskResults, queue.removeTaskClaim);
        sinon.assert.calledWithExactly(queue.removeTaskClaim, task);
      });
    });

    it('should reject if the task is not valid', () => {
      return Promise.all([
        queue.runTask().then(unexpected, noop),
        queue.runTask({key}).then(unexpected, noop),
        queue.runTask({data}).then(unexpected, noop)
      ]);
    });

  });

  describe('sheduleTask', () => {
    let key, data, result;

    beforeEach(() => {
      result = {};
      sinon.stub(queue, 'runTask').returns(Promise.resolve(result));

      key = 'someTaskId';
      data = {
        payload: {
          language: 'java'
        },
        tries: {}
      };
    });

    it('should shedule task', () => {
      return queue.sheduleTask(key, data).then(
        actualResult => expect(actualResult).to.be(actualResult)
      );
    });

    it('should reject if the task failed', () => {
      const err = new Error();

      queue.runTask.returns(Promise.reject(err));

      return queue.sheduleTask(key, data).then(
        () => Promise.reject(new Error('unexpected')),
        e => expect(e).to.be(err)
      );
    });

    it('should skip task if the worker is not authenticated', () => {
      queue.authData.uid = undefined;

      return queue.sheduleTask(key, data).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should skip task if the worker is not a worker', () => {
      queue.authData.auth.isWorker = undefined;

      return queue.sheduleTask(key, data).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should skip task if the worker is not a worker for the correct queue', () => {
      queue.authData.auth.queue = 'foo';

      return queue.sheduleTask(key, data).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should skip task with unsupported language', () => {
      data.payload.language = 'dinolang';

      return queue.sheduleTask(key, data).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should skip task with worker already tried to run it before', () => {
      data.tries.someWorker = 12345;

      return queue.sheduleTask(key, data).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

  });

  describe('claimTask', () => {
    let taskRef, task;

    beforeEach(() => {
      taskRef = {update: sinon.stub().yields(null)};
      queue.tasksRef.child.withArgs('someTaskId').returns(taskRef);

      task = {key: 'someTaskId'};
    });

    it('should claimTask', () => {
      return queue.claimTask(task).then(() => {
        sinon.assert.calledOnce(taskRef.update);
        sinon.assert.calledWithExactly(
          taskRef.update,
          sinon.match(data => {
            return (
              Object.keys(data).length === 3 &&
              sinon.match({
                worker: 'someWorker',
                started: true,
                startedAt: Firebase.ServerValue.TIMESTAMP
              }, data)
            );
          }),
          sinon.match.func
        );
      });
    });

    it('should reject if the claim failed', () => {
      const err = new Error();

      taskRef.update.yields(err);

      return queue.claimTask(task).then(
        unexpected,
        e => expect(e).to.be(err)
      );
    });

    it('should reject if the use is not a worker', () => {
      queue.authData.auth.isWorker = false;
      return queue.claimTask(task).then(unexpected, noop);
    });

  });

  describe('removeTaskClaim', () => {
    let taskRef, task;

    beforeEach(() => {
      taskRef = {update: sinon.stub().yields(null)};
      queue.tasksRef.child.withArgs('someTaskId').returns(taskRef);

      task = {
        key: 'someTaskId',
        data: {
          worker: 'someWorker'
        }
      };
    });

    it('should remove claim', () => {
      return queue.removeTaskClaim(task).then(() => {
        sinon.assert.calledOnce(taskRef.update);
        sinon.assert.calledWithExactly(
          taskRef.update,
          sinon.match(data => {
            return (
              Object.keys(data).length === 4 &&
              data.started === false &&
              data.startedAt === null &&
              data.worker === null &&
              data['tries/someWorker'] === Firebase.ServerValue.TIMESTAMP
            );
          }),
          sinon.match.func
        );
      });
    });

    it('should reject if the worker is not logged on', () => {
      queue.authData = null;

      return queue.removeTaskClaim(task).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

    it('should not record update tries property if task data are missing', () => {
      task.data = null;

      return queue.removeTaskClaim(task).then(() => {
        sinon.assert.calledWithExactly(
          taskRef.update,
          sinon.match(data => {
            return (
              Object.keys(data).length === 3 &&
              data['tries/someWorker'] == null
            );
          }),
          sinon.match.func
        );
      });
    });

    it('should reject if fails to remove the claim', () => {
      const err = new Error();

      taskRef.update.yields(err);

      return queue.removeTaskClaim(task).then(
        unexpected,
        e => expect(e).to.be(err)
      );
    });

  });

  describe('reset', () => {
    let completeTasks;

    beforeEach(() => {
      const resolvers = [];

      // mock task procession and block task completion.
      queue.runTask = () => {
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      };

      completeTasks = () => resolvers.map(resolve => resolve());

      queue.taskQueue.concurrency = 1;
      queue.taskQueue.push([{}, {}, {}]);
    });

    it('should empty the in memory queue', () => {
      expect(queue.taskQueue.length()).to.be(3);
      queue.reset();
      expect(queue.taskQueue.length()).to.be(0);
    });

    it('should return a promise resolving when all running tasks are completed', done => {
      let isReset = false;

      poll(() => {
        return queue.taskQueue.running() > 0;
      }, 10).then(() => {
        const resetPromise = queue.reset().then(() => isReset = true);

        setTimeout(() => {
          expect(isReset).to.be(false);

          completeTasks();

          resetPromise.then(() => done(), done);
        }, 10);
      });
    });

    it('should reject if the user is not a worker', () => {
      queue.authData.auth.isWorker = false;
      return queue.reset().then(unexpected, noop);
    });

  });

  describe('removeWorkers', () => {
    let onQueryFailure, onRemovalFailure, query, snapshot, key, taskRef;

    beforeEach(() => {
      onQueryFailure = sinon.spy();
      onRemovalFailure = sinon.spy();
      key = 'someTaskId';
      taskRef = {
        remove: sinon.stub().yields(null)
      };
      snapshot = {
        ref: () => taskRef,
        key: () => key
      };
      query = {
        endAt: sinon.stub().withArgs(12345).returnsThis(),
        limitToFirst: sinon.stub().returnsThis(),
        on: sinon.stub(),
        off: sinon.spy()
      };

      query.on.withArgs('child_added').returnsArg(1);
      query.on.withArgs('child_added').yields(snapshot);

      queue.workersRef.orderByChild = sinon.stub().withArgs('presence').returns(query);
    });

    it('should remove old workers', () => {
      queue.removeWorkers(12345);
      sinon.assert.calledOnce(taskRef.remove);
    });

    it('should allow removal to be cancelled', () => {
      const cancel = queue.removeWorkers(12345);
      const handler = query.on.lastCall.args[1];

      cancel();
      sinon.assert.calledOnce(query.off);
      sinon.assert.calledOnce(query.off, 'child_added', handler);
    });

    it('should call the failure handler on query failure', () => {
      query.on = sinon.stub();
      query.on.withArgs('child_added').returnsArg(1);

      queue.removeWorkers(12345, onQueryFailure);
      sinon.assert.notCalled(taskRef.remove);

      query.on.withArgs('child_added').callArg(2);
      sinon.assert.calledOnce(onQueryFailure);
    });

    it('should call the failure handler on query failure', () => {
      const err = new Error();

      taskRef.remove.yields(err);
      queue.removeWorkers(12345, null, onRemovalFailure);

      query.on.withArgs('child_added').callArg(2);
      sinon.assert.calledOnce(onRemovalFailure);
      sinon.assert.calledWithExactly(onRemovalFailure, err);
    });

  });

  describe('removeTaskClaims', () => {
    let query, snapshot, onFailure;

    beforeEach(() => {
      sinon.stub(queue, 'removeTaskClaim');
      onFailure = sinon.spy();

      snapshot = (key, startedAt) => {
        const data = {
          started: !!startedAt,
          startedAt: startedAt || null
        };

        return {
          val: () => data,
          key: () => key
        };
      };
      query = {
        equalTo: sinon.stub().withArgs(false).returnsThis(),
        on: sinon.stub().returnsArg(1),
        off: sinon.stub()
      };
      queue.tasksRef.orderByChild = sinon.stub().withArgs('completed').returns(query);
    });

    it('should query pending tasks', () => {
      queue.removeTaskClaims(12345, onFailure);
      sinon.assert.calledOnce(query.equalTo);
      sinon.assert.calledOnce(query.on);
      sinon.assert.calledWithExactly(
        query.on, 'child_added', sinon.match.func, onFailure
      );
    });

    it('should remove old claims', () => {
      queue.removeTaskClaims(12345);
      query.on.callArgWith(1, snapshot('key1'));
      query.on.callArgWith(1, snapshot('key2', 12344));
      query.on.callArgWith(1, snapshot('key3', 12343));
      query.on.callArgWith(1, snapshot('key4', 12346));

      sinon.assert.calledTwice(queue.removeTaskClaim);
      sinon.assert.calledWithExactly(queue.removeTaskClaim, sinon.match({key: 'key2'}));
      sinon.assert.calledWithExactly(queue.removeTaskClaim, sinon.match({key: 'key3'}));
    });

    it('should let the watch be cancelled', () => {
      const cancel = queue.removeTaskClaims(12345);
      const handler = query.on.lastCall.args[1];

      cancel();
      sinon.assert.calledOnce(query.off, handler);
      sinon.assert.calledOnce(query.off, 'child_added', handler);
    });

  });

});

function poll(fn, interval, timeout) {
  timeout = timeout || 2000;
  interval = interval || 100;

  if (interval < 10) {
    interval = 10;
  }

  return new Promise((resolve, reject) => {
    let tries = timeout / interval;

    test();

    function test() {
      const result = fn();

      if (result) {
        return resolve(result);
      }

      if (--tries <= 0) {
        return reject(new Error('timeout'));
      }

      setTimeout(test, interval);
    }
  });
}
