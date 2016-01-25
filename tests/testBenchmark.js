'use strict';

const expect = require('expect.js');
const sinon = require('sinon');

const benchmark = require('../src/benchmark');


describe('benchmark', () => {
  let singpath, logger;

  beforeEach(() => {
    singpath = {
      $firebase: sinon.stub().returns(''),
      queues: {
        pushTasks: sinon.stub().returns(Promise.resolve([])),
        consumeTasks: sinon.stub().returns(Promise.resolve([]))
      }
    };
    logger = {
      debug: sinon.stub(),
      info: sinon.stub()
    };
  });

  describe('run', () => {

    it('should create tasks', () => {
      const payloads = [{}, {}];

      return benchmark.run(singpath, {
        payloads, logger, length: 3, queueId: 'default'
      }).then(() => {
        sinon.assert.calledOnce(singpath.queues.pushTasks);
        sinon.assert.calledWithExactly(singpath.queues.pushTasks, sinon.match.array, 'default');

        const taskPayloads = singpath.queues.pushTasks.getCall(0).args[0];

        expect(taskPayloads).to.have.length(3);
        expect(taskPayloads[0]).to.be(payloads[0]);
        expect(taskPayloads[1]).to.be(payloads[1]);
        expect(taskPayloads[2]).to.be(payloads[0]);
      });
    });

    it('should consume tasks', () => {
      const payloads = [{}, {}];
      const taskRefs = [{}, {}];

      singpath.queues.pushTasks.returns(Promise.resolve(taskRefs));

      return benchmark.run(singpath, {
        payloads, logger, length: 2, queueId: 'default'
      }).then(() => {
        sinon.assert.calledOnce(singpath.queues.consumeTasks);
        sinon.assert.calledWithExactly(singpath.queues.consumeTasks, taskRefs);
      });
    });

    it('should calculate benchmark stats', () => {
      const payloads = [{}, {}];
      const taskRefs = [{}, {}];
      const tasksSnapshots = [{
        val() {
          return {
            startedAt: 1000,
            completedAt: 2000
          };
        }
      }, {
        val() {
          return {
            startedAt: 1001,
            completedAt: 3000
          };
        }
      }];

      singpath.queues.pushTasks.returns(Promise.resolve(taskRefs));
      singpath.queues.consumeTasks.returns(Promise.resolve(tasksSnapshots));

      return benchmark.run(singpath, {
        payloads, logger, length: 2, queueId: 'default'
      }).then(stats => {
        expect(stats.duration).to.be(2000);
        expect(stats.operationPerSecond).to.be(1);
      });
    });

  });

});
