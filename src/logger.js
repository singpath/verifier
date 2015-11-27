'use strict';
const util = require('util');


const DEBUG = 10;
const INFO = 20;
const ERROR = 30;

exports.levels = {DEBUG, INFO, ERROR};

class Logger {

  constructor(stream, level) {
    this.stream = stream;
    this.level = level || DEBUG;
  }

  now() {
    return new Date().toISOString().replace('T', ' ').slice(0, -1);
  }

  _write(args) {
    this.stream.write(util.format.apply(util, args));
  }

  _log(args, level) {
    args = Array.from(args);

    if (level < this.level) {
      return;
    }

    if (args.length < 1) {
      return;
    }

    args[0] = `${this.now()} - ${args[0]}\n`;
    this._write(args);
  }

  log() {
    this._log(arguments, INFO);
  }

  info() {
    this._log(arguments, INFO);
  }

  error() {
    this._log(arguments, ERROR);
  }

  warn() {
    this._log(arguments, ERROR);
  }

  debug() {
    this._log(arguments, DEBUG);
  }
}

/**
 * Create a new logger.
 *
 * @param  {Stream} stream
 * @param  {Number} level
 * @return {Logger}
 */
exports.create = function logger(stream, level) {
  return new Logger(stream, level);
};
