'use strict';

const expect = require('expect.js');
const sinon = require('sinon');
const Firebase = require('firebase');

const verifier = require('../');
const verifierComponent = require('../src/verifier');


describe('queue', () => {
  let queue, singpathRef, tasksRef, someTaskRef, rootRef, dockerClient;

  beforeEach(() => {
    const workersRef = {};
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
      child: sinon.stub().returns(someTaskRef)
    };
    tasksRef.path = ['singpath', 'queues', 'default', 'tasks'];

    const firebaseClient = {
      key: sinon.stub().returns('default'),
      root: sinon.stub().returns(rootRef),
      child: sinon.stub(),
      onAuth: sinon.stub()
    };

    firebaseClient.child.withArgs('tasks').returns(tasksRef);
    firebaseClient.child.withArgs('workers').returns(workersRef);

    dockerClient = {};
    queue = verifier.singpathQueue(firebaseClient, dockerClient, {logger});
  });

  it('should set singpathRef property', () => {
    expect(queue.singpathRef).to.be(singpathRef);
  });

  it('should set taskRef property', () => {
    expect(queue.tasksRef).to.be(tasksRef);
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

    it('should reject if the user is not a worker', done => {
      queue.isWorker.returns(false);

      queue.savePushTaskResults(task, results).then(
        () => done(new Error('unexpected')),
        () => done()
      );
    });

    it('should reject if the task has no solutionRef', done => {
      task.data.solutionRef = undefined;

      queue.savePushTaskResults(task, results).then(
        () => done(new Error('unexpected')),
        () => done()
      );
    });

    it('should reject if the task solutionRef is invalid', done => {
      task.data.solutionRef = 'some/where';

      queue.savePushTaskResults(task, results).then(
        () => done(new Error('unexpected')),
        () => done()
      );
    });

    it('should update the solution with the task result', done => {
      queue.savePushTaskResults(task, results).then(() => {
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
        done();
      }).catch(done);
    });

    it('should update the task as completed and consumed', done => {
      queue.savePushTaskResults(task, results).then(() => {
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
        done();
      }).catch(done);
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

    it('should update the task as completed', done => {
      queue.savePullTaskResults(task, results).then(() => {
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

        done();
      }).catch(done);
    });

    it('should save the result with the task', done => {
      queue.savePullTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.tasksRef.child);
        sinon.assert.calledWithExactly(queue.tasksRef.child,'someTaskId');

        sinon.assert.calledOnce(someTaskRef.update);
        sinon.assert.calledWithExactly(
          someTaskRef.update,
          sinon.match({results}),
          sinon.match.func
        );

        done();
      }).catch(done);
    });

    it('should reject if the user is not a worker', done => {
      queue.isWorker.returns(false);

      queue.savePullTaskResults(task, results).then(
        () => done(new Error('unexpected')),
        () => done()
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

    it('should reject if the user is not a worker', done => {
      queue.isWorker.returns(false);
      queue.saveTaskResults(task, results).then(
        () => done(new Error('unexpected')),
        () => done()
      );
    });

    it('should save results with the tasks', done => {
      queue.saveTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.savePullTaskResults);
        sinon.assert.notCalled(queue.savePushTaskResults);
        done();
      }).catch(done);
    });

    it('should save the result with the solution', done => {
      task.data.solutionRef = 'singpath/queuedSolution/some/where';
      queue.saveTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.savePushTaskResults);
        sinon.assert.notCalled(queue.savePullTaskResults);
        done();
      }).catch(done);
    });

    it('should save the result with the task if it fails to save them with the solution', done => {
      task.data.solutionRef = 'singpath/queuedSolution/some/where';
      queue.savePushTaskResults.returns(Promise.reject());
      queue.saveTaskResults(task, results).then(() => {
        sinon.assert.calledOnce(queue.savePushTaskResults);
        sinon.assert.calledOnce(queue.savePullTaskResults);
        done();
      }).catch(done);
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

    it('should run the next task in queue after completion', done => {
      sinon.spy(queue, 'runTask');
      queue.tasksToRun.shift.onFirstCall().returns({});
      queue.tasksToRun.shift.onSecondCall().returns(undefined);

      queue.runTask({}).then(() => {
        sinon.assert.calledThrice(queue.runTask);
        done();
      }).catch(done);
    });

  });

});
