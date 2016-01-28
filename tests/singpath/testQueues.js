'use strict';

var Rx = require('rx-lite');
const expect = require('expect.js');
const sinon = require('sinon');

const verifier = require('../../');

describe('singpath/queues', () => {
  let firebase, singpath, ref, status;

  beforeEach(() => {
    status = new Rx.ReplaySubject(1);
    status.onNext({uid: 'bob'});
    ref = {
      ServerValue: {TIMESTAMP:  {'.sv': 'timestamp'}},
      observeAuth: sinon.stub().returns(status),
      observe: sinon.stub(),
      push: sinon.stub()
    };
    firebase = sinon.stub().returns(ref);
    singpath = new verifier.singpath.Singpath(firebase);
  });

  it('should be one of the singpath service', () => {
    expect(singpath.queues).to.be.ok();
  });

  describe('pushTasks', () => {

    it('should push each tasks', () => {
      const payloads = [{}, {}];
      const task1Ref = {set: sinon.stub().returns(Promise.resolve())};
      const task2Ref = {set: sinon.stub().returns(Promise.resolve())};

      firebase.reset();
      ref.push.onFirstCall().returns(task1Ref);
      ref.push.onSecondCall().returns(task2Ref);

      return singpath.queues.pushTasks(payloads).then(() => {
        sinon.assert.calledOnce(firebase);

        sinon.assert.calledOnce(task1Ref.set);
        sinon.assert.calledWithExactly(task1Ref.set, sinon.match({
          completed: false,
          started: false,
          consumed: false,
          payload: payloads[0],
          owner: 'bob',
          createdAt: ref.ServerValue.TIMESTAMP
        }));

        sinon.assert.calledOnce(task2Ref.set);
        sinon.assert.calledWithExactly(task1Ref.set, sinon.match({
          completed: false,
          started: false,
          consumed: false,
          payload: payloads[1],
          owner: 'bob',
          createdAt: ref.ServerValue.TIMESTAMP
        }));
      });
    });

    it('should resolve to an array of task firebase reference', () => {
      const payloads = [{}, {}];
      const task1Ref = {set: sinon.stub().returns(Promise.resolve())};
      const task2Ref = {set: sinon.stub().returns(Promise.resolve())};

      firebase.reset();
      ref.push.onFirstCall().returns(task1Ref);
      ref.push.onSecondCall().returns(task2Ref);

      return singpath.queues.pushTasks(payloads).then(tasks => {
        expect(tasks).to.have.length(2);
        expect(tasks[0]).to.be(task1Ref);
        expect(tasks[1]).to.be(task2Ref);
      });
    });

    it('should reject if the user is not logged in', () => {
      const payloads = [{}, {}];
      const task1Ref = {set: sinon.stub().returns(Promise.resolve())};
      const task2Ref = {set: sinon.stub().returns(Promise.resolve())};

      firebase.reset();
      ref.push.onFirstCall().returns(task1Ref);
      ref.push.onSecondCall().returns(task2Ref);

      status.onNext(null);

      return singpath.queues.pushTasks(payloads).then(
        () => Promise.reject(new Error('unexpected')),
        () => undefined
      );
    });

  });

  describe('consumeTasks', () => {

    it('should observe task value', () => {
      const task1Ref = {observe: sinon.stub(), update: sinon.stub().returns(Promise.resolve())};
      const task2Ref = {observe: sinon.stub(), update: sinon.stub().returns(Promise.resolve())};
      const snapshot1 = {val: () => ({completed: true}), ref: () => task1Ref};
      const snapshot2 = {val: () => ({completed: true}), ref: () => task2Ref};

      task1Ref.observe.returns(Rx.Observable.of(snapshot1));
      task2Ref.observe.returns(Rx.Observable.of(snapshot2));

      return singpath.queues.consumeTasks([task1Ref, task2Ref]).then(() => {
        sinon.assert.calledOnce(task1Ref.observe);
        sinon.assert.calledWithExactly(task1Ref.observe, 'value');
        sinon.assert.calledOnce(task2Ref.observe);
        sinon.assert.calledWithExactly(task2Ref.observe, 'value');
      });
    });

    it('should mark the task as consumed', () => {
      const task1Ref = {observe: sinon.stub(), update: sinon.stub().returns(Promise.resolve())};
      const task2Ref = {observe: sinon.stub(), update: sinon.stub().returns(Promise.resolve())};
      const snapshot1 = {val: () => ({completed: true}), ref: () => task1Ref};
      const snapshot2 = {val: () => ({completed: true}), ref: () => task2Ref};

      task1Ref.observe.returns(Rx.Observable.of(snapshot1));
      task2Ref.observe.returns(Rx.Observable.of(snapshot2));

      return singpath.queues.consumeTasks([task1Ref, task2Ref]).then(() => {
        sinon.assert.calledOnce(task1Ref.update);
        sinon.assert.calledWithExactly(task1Ref.update, sinon.match({consumed: true}));
        sinon.assert.calledOnce(task2Ref.update);
        sinon.assert.calledWithExactly(task2Ref.update, sinon.match({consumed: true}));
      });
    });

    it('should resolve once all the tasks are completed', () => {
      const task1Ref = {observe: sinon.stub(), update: sinon.stub().returns(Promise.resolve())};
      const task2Ref = {observe: sinon.stub(), update: sinon.stub().returns(Promise.resolve())};
      const snapshot1 = {val: () => ({completed: true}), ref: () => task1Ref};
      const snapshot2 = {val: () => ({completed: true}), ref: () => task2Ref};

      task1Ref.observe.returns(Rx.Observable.of(snapshot1));
      task2Ref.observe.returns(Rx.Observable.of(snapshot2));

      return singpath.queues.consumeTasks([task1Ref, task2Ref]).then(tasks => {
        expect(tasks).to.have.length(2);
        expect(tasks[0]).to.be(snapshot1);
        expect(tasks[1]).to.be(snapshot2);
      });
    });

  });

});
