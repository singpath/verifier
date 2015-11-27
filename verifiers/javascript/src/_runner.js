#!/usr/bin/env node
'use strict';

const program = require('commander');
const runner = require('./index');

program.option('--solution <solution>').option('--tests <tests>');

function runTests(solution, tests) {
  const ctx = {};

  try {
    runner.runSolution(solution, ctx);
    runner.initTests(tests, ctx);
    return runner.runTests(ctx);
  } catch (e) {
    return Promise.resolve({
      solved: false,
      errors: e.toString()
    });
  }
}

function main(argv) {
  /* eslint no-console: 0 */

  runTests(argv.solution, argv.tests).then(function(resp) {
    console.log(JSON.stringify(resp));
  });
}

main(program.parse(process.argv));
