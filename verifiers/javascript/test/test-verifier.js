/* eslint-env node, mocha */
'use strict';

var verifier = require('../src/index.js');
var assert = require('assert');

describe('verifier', function() {

  describe('runSolution', function() {

    it('should populate ctx', function() {
      var ctx = {};

      verifier.runSolution('foo = 1;', ctx);
      assert.equal(1, ctx.foo);
    });

    it('should throw if solution code is missing', function() {
      var ctx = {};

      assert.throws(function() {
        verifier.runSolution(undefined, ctx);
      });
    });

    it('should not throw if ctx is missing', function() {
      assert.doesNotThrow(function() {
        verifier.runSolution('foo = 1;');
      });
    });

    it('should throw if the solution is setting a reserve property', function() {
      assert.throws(function() {
        verifier.runSolution('test = function(){}');
      });
      assert.throws(function() {
        verifier.runSolution('__tests__ = []');
      });
      assert.throws(function() {
        verifier.runSolution('assert = {}');
      });
    });

  });

  describe('initTests', function() {

    it('should run tests code', function() {
      var ctx = {};

      verifier.initTests('foo = 1;', ctx);
      assert.equal(1, ctx.foo);
    });

    it('should add `test` to ctx', function() {
      var ctx = {};

      assert.doesNotThrow(function() {
        verifier.initTests('if (!test) throw new Error("Cannot set tests")', ctx);
      });
    });

    it('should add `assert` to ctx', function() {
      var ctx = {};

      assert.doesNotThrow(function() {
        verifier.initTests('if (!assert) throw new Error("Cannot set tests")', ctx);
      });
    });

    it('should throw if tests code is missing', function() {
      var ctx = {};

      assert.throws(function() {
        verifier.initTests(undefined, ctx);
      });
    });

    it('should throw if ctx is missing', function() {
      assert.throws(function() {
        verifier.initTests('');
      });
    });

    describe('test', function() {

      it('should add a test', function() {
        var ctx = {};

        verifier.initTests('test("test 1", function(){});', ctx);
        assert.equal(1, ctx.__tests__.length);
        assert.equal('test 1', ctx.__tests__[0].test);
        assert.equal('function', typeof ctx.__tests__[0].cb);
      });

    });

  });

  describe('runTests', function() {

    it('should run collected tests', function(done) {
      var called;
      var ctx = {
        __tests__: [{
          test: 'test 1',
          cb: function() {
            called = true;
          }
        }]
      };

      verifier.runTests(ctx).then(function() {
        assert.ok(called);
        done();
      }).catch(done);
    });

    it('should return tests as solved when all tests succeed', function(done) {
      var ctx = {
        __tests__: [{
          test: 'test 1',
          cb: function() {}
        }, {
          test: 'test 2',
          cb: function() {}
        }]
      };

      verifier.runTests(ctx).then(function(response) {
        assert.ok(response.solved);
        done();
      }).catch(done);
    });

    it('should return tests as not solved when any test fails', function(done) {
      var ctx = {
        __tests__: [{
          test: 'test 1',
          cb: function() {}
        }, {
          test: 'test 2',
          cb: function() {
            throw new Error();
          }
        }]
      };

      verifier.runTests(ctx).then(function(response) {
        assert.equal(false, response.solved);
        done();
      }).catch(done);
    });

    it('should return each test result', function(done) {
      var ctx = {
        __tests__: [{
          test: 'test 1',
          cb: function() {}
        }, {
          test: 'test 2',
          cb: function() {
            throw new Error();
          }
        }]
      };

      verifier.runTests(ctx).then(function(response) {
        var results;

        assert.equal(2, response.results.length);

        results = response.results.reduce(function(all, result) {
          all[result.test] = result;
          return all;
        }, {});

        assert.ok(results['test 1'].correct);
        assert.equal(false, results['test 2'].correct);
        assert.ok(results['test 2'].error);

        done();
      }).catch(done);
    });

    it('should never reject', function(done) {
      var ctx = {
        __tests__: [{
          test: 'test 1',
          cb: function() {
            throw new Error('Catch me');
          }
        }]
      };

      verifier.runTests(ctx).then(function() {
        done();
      }).catch(done);
    });

    it('should handle async test', function(done) {
      var ctx = {
        __tests__: [{
          test: 'test 1',
          cb: function() {
            return new Promise(function(_, fails) {
              setTimeout(function() {
                fails(new Error());
              }, 100);
            });
          }
        }]
      };

      verifier.runTests(ctx).then(function(response) {
        assert.equal(false, response.solved);
        done();
      }).catch(done);
    });

  });

  describe('testSolution', function() {

    it('should return test as solved if all tests resolve', function(done) {
      verifier.testSolution(
        'foo = 1;',
        'test("test1", function() { assert.ok(foo); }); test("test2", function() {assert.equal(1, foo)})'
      ).then(function(resp) {
        assert.ok(resp.solved);
        done();
      }).catch(done);
    });

    it('should return test not as solved if any tests fails', function(done) {
      verifier.testSolution(
        'foo = 1;',
        'test("test1", function() { assert.ok(foo); }); test("test2", function() {assert.equal(2, foo)})'
      ).then(function(resp) {
        assert.equal(false, resp.solved);
        done();
      }).catch(done);
    });

    it('should timeout', function(done) {
      verifier.testSolution(
        '',
        'test("test1", function() { return new Promise(function(_, fails) {setTimeout(fails, 1000)}) });',
        {timeout: 500}
      ).then(function(resp) {
        assert.equal(false, resp.solved);
        done();
      }).catch(done);
    });

  });

});
