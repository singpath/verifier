'use strict';


const DEFAULT_LENGTH = 20;
const DEFAULT_PAYLOADS = [{
  language: 'javascript',
  tests: `test('foo === 1', () => assert.equal(1, foo));`,
  solution: 'foo = 1'
}, {
  language: 'python',
  tests: '>>> foo\n1',
  solution: 'foo = 1'
}, {
  language: 'java',
  tests: `
import org.junit.Test;
import static org.junit.Assert.*;
import junit.framework.*;
import com.singpath.SolutionRunner;

public class SingPathTest extends SolutionRunner {

  @Test
  public void testSolution() throws Exception {
    SingPath sp = new SingPath();
    assertEquals(4.0, sp.add(2.0, 2.0));
  }
}`,
  solution: `
public class SingPath {
  public Double add(Double x, Double y) {
    return x + y + 1;
  }
}`
}];


/**
 * Create solutions in a queue, wait for their completion and calculate the
 * number of operation per second.
 *
 * Options:
 * - `payloads`: array of payload to run (a js, a java and a python payload).
 * - `length`: how many operations to run (20 by default).
 * - 'queueId': queue name to push task to.
 * - `logger`: default to console.
 *
 *
 * Note: it doesn't setup or reset the queue.
 *
 * @param  {Object}  singpath Singpath service
 * @param  {Object}  options
 * @return {Promise}          Resolve with stats once completed.
 */
exports.run = function runBenchmark(singpath, options) {
  options = options || {};

  const samples = [].concat(options.payloads || DEFAULT_PAYLOADS);
  const sampleSize = samples.length;

  const payloads = [];
  const length = options.length || DEFAULT_LENGTH;

  const logger = options.logger || console;

  for (let i = 0; i < length; i++) {
    payloads[i] = samples[i % sampleSize];
  }

  logger.info('creating %s payloads...', length);

  return singpath.queues.pushTasks(payloads, options.queueId).then(refs => {
    logger.info('Tasks created.');
    logger.info('Waiting for completion...');

    return singpath.queues.consumeTasks(refs);
  }).then(snapshots => {
    logger.info('Tasks completed.');

    if (snapshots.length < 1) {
      return;
    }

    return snapshots.map(
      s => s.val()
    ).reduce((stats, current) => ({
      startedAt: Math.min(stats.startedAt, current.startedAt),
      completedAt: Math.max(stats.completedAt, current.completedAt)
    }));
  }).then(stats => {
    if (!stats) {
      return;
    }

    stats.operation = length;
    stats.duration = stats.completedAt - stats.startedAt,
    stats.operationPerSecond = length * 1000 / stats.duration;

    logger.info('%s tasks completed in %s ms', stats.operation, stats.duration);
    logger.info('%s op/sec', stats.operationPerSecond);

    return stats;
  });
};
