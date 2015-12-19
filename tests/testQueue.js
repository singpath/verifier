'use strict';

const expect = require('expect.js');
const sinon = require('sinon');
const Firebase = require('firebase');

const verifier = require('../');
const verifierComponent = require('../src/verifier');


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

    rootRef = { child: sinon.stub() };
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

      newTaskRef = { set: sinon.stub().yields(null) };
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
      presenceRef = { set: sinon.stub().yields(null) };
      workerRef = { child: sinon.stub().withArgs('presence').returns(presenceRef) };
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
    let deregister, stopWatchOnWorker, stopWatchAddedTask, stopWatchOnUpdatedTask;

    beforeEach(() => {
      deregister = sinon.stub();
      stopWatchOnWorker = sinon.stub();
      stopWatchAddedTask = sinon.stub();
      stopWatchOnUpdatedTask = sinon.stub();

      sinon.stub(queue, 'registerWorker').returns(Promise.resolve(deregister));
      sinon.stub(queue, 'monitorWorkers').returns(stopWatchOnWorker);
      sinon.stub(queue, 'monitorAddedTask').returns(stopWatchAddedTask);
      sinon.stub(queue, 'monitorUpdatedTask').returns(stopWatchOnUpdatedTask);
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

    it('should start monitoring added task', () => {
      return queue.watch().then(() => {
        sinon.assert.calledOnce(queue.monitorAddedTask);
        sinon.assert.calledWithExactly(queue.monitorAddedTask, sinon.match.func);
      });
    });

    it('should start monitoring updated task', () => {
      return queue.watch().then(() => {
        sinon.assert.calledOnce(queue.monitorUpdatedTask);
        sinon.assert.calledWithExactly(queue.monitorUpdatedTask, sinon.match.func);
      });
    });

    it('should let the watch be cancelled', () => {
      return queue.watch().then(cancel => {
        expect(cancel).to.be.an(Function);

        return cancel();
      }).then(() => {
        sinon.assert.calledOnce(deregister);
        sinon.assert.calledOnce(stopWatchOnWorker);
        sinon.assert.calledOnce(stopWatchAddedTask);
        sinon.assert.calledOnce(stopWatchOnUpdatedTask);
      });
    });

    it('should cancel the watch if one of the watch fails', () => {
      return queue.watch().then(() => {
        const failureCb = queue.monitorWorkers.lastCall.args[0];

        failureCb(new Error());

        sinon.assert.calledOnce(deregister);
        sinon.assert.calledOnce(stopWatchOnWorker);
        sinon.assert.calledOnce(stopWatchAddedTask);
        sinon.assert.calledOnce(stopWatchOnUpdatedTask);
      });
    });

    it('should cancel the watch once even if many of the watches fails', done => {
      // will fail if called more than once
      queue.on('watchStopped', () => done());

      queue.watch().then(() => {
        [queue.monitorWorkers, queue.monitorAddedTask, queue.monitorUpdatedTask].forEach(
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
        stopWatchAddedTask.throws(new Error('falied to stop watch'));
        stopWatchOnUpdatedTask.throws(new Error('falied to stop watch'));

        return queue.watch().then(cancel => {
          return cancel();
        }).then(
          () => Promise.reject(new Error('unexpected')),
          () => {
            sinon.assert.calledOnce(deregister);
            sinon.assert.calledOnce(stopWatchOnWorker);
            sinon.assert.calledOnce(stopWatchAddedTask);
            sinon.assert.calledOnce(stopWatchOnUpdatedTask);
          }
        );
      });

      it('should fire a watchStopped event', done => {
        queue.on('watchStopped', () => done());

        queue.watch().then(cancel => {
          return cancel();
        });
      });

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

  });

  describe('runTask', () => {

    beforeEach(() => {
      sinon.stub(queue, 'claimTask').returns(Promise.resolve());
      sinon.stub(queue, 'saveTaskResults').returns(Promise.resolve());
      sinon.stub(queue, 'removeTaskClaim').returns(Promise.resolve());
      sinon.stub(queue.tasksToRun, 'shift').returns();
      sinon.stub(verifierComponent, 'verify').returns(Promise.resolve());
    });

    afterEach(() => {
      verifierComponent.verify.restore();
    });

    it('should run the next task in queue after completion', () => {
      sinon.spy(queue, 'runTask');
      queue.tasksToRun.shift.onFirstCall().returns({});
      queue.tasksToRun.shift.onSecondCall().returns(undefined);

      return queue.runTask({}).then(() => {
        sinon.assert.calledThrice(queue.runTask);
      });
    });

  });

  describe('sheduleTask', () => {
    let key, data;

    beforeEach(() => {
      sinon.stub(queue.tasksToRun, 'push');
      sinon.stub(queue.tasksToRun, 'shift');
      sinon.stub(queue, 'runTask');

      key = 'someTaskId';
      data = {
        payload: {
          language: 'java'
        },
        tries: {}
      };
    });

    it('should shedule task', () => {
      queue.sheduleTask(key, data);
      sinon.assert.calledOnce(queue.tasksToRun.push);
      sinon.assert.calledWithExactly(queue.tasksToRun.push, {key, data});
    });

    it('should skip task if the worker is not authenticated', () => {
      queue.authData.uid = undefined;
      queue.sheduleTask(key, data);
      sinon.assert.notCalled(queue.tasksToRun.push);
    });

    it('should skip task if the worker is not a worker', () => {
      queue.authData.auth.isWorker = undefined;
      queue.sheduleTask(key, data);
      sinon.assert.notCalled(queue.tasksToRun.push);
    });

    it('should skip task if the worker is not a worker for the correct queue', () => {
      queue.authData.auth.queue = 'foo';
      queue.sheduleTask(key, data);
      sinon.assert.notCalled(queue.tasksToRun.push);
    });

    it('should skip task with unsupported language', () => {
      data.payload.language = 'dinolang';

      queue.sheduleTask(key, data);
      sinon.assert.notCalled(queue.tasksToRun.push);
    });

    it('should skip task with worker already tried to run it before', () => {
      data.payload.language = 'dinolang';
      data.tries.someWorker = 12345;

      queue.sheduleTask(key, data);
      sinon.assert.notCalled(queue.tasksToRun.push);
    });

  });

  describe('removeTaskClaim', () => {
    let task;

    beforeEach(() => {
      task = {
        key: 'someTaskId',
        data: {
          worker: 'someWorker'
        }
      };
    });

    it('should remove claim', () => {
      return queue.removeTaskClaim(task).then(() => {
        sinon.assert.calledOnce(queue.tasksRef.child);
        sinon.assert.calledWithExactly(queue.tasksRef.child, 'someTaskId');

        sinon.assert.calledOnce(someTaskRef.update);
        sinon.assert.calledWithExactly(
          someTaskRef.update,
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
          someTaskRef.update,
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

  });

});
