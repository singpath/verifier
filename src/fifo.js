'use strict';

/**
 * FIFO queue using array but limiting array resize when removing an element.
 *
 */
exports.FIFO = class FIFO {

  /**
   * FIFO constructor.
   *
   * @param  {int}    bufferSize Defines how often the internal array should
   *                  be compresses (removing unqueued element).
   * @return {FIFO}
   */
  constructor(bufferSize) {
    this.bufferSize = bufferSize || 20;
    this.queue = [];
    this.offset = 0;
  }

  get length() {
    return this.queue.length - this.offset;
  }

  isEmpty() {
    return this.offset >=  this.queue.length;
  }

  /**
   * Enqueue an element.
   *
   * @param  {Object}  obj
   */
  push(obj) {
    this.queue.push(obj);
  }

  /**
   * Dequeue an element.
   *
   * @return {Object}
   */
  shift() {
    if (this.isEmpty()) {
      return undefined;
    }

    try{
      return this.queue[this.offset++];
    } finally {
      this.compress();
    }

  }

  /**
   * Remove unqueued element.
   *
   */
  compress(force) {
    if (force || (this.offset <= this.bufferSize)) {
      return;
    }

    this.queue = this.queue.slice(this.offset);
    this.offset = 0;
  }

  /**
   * Reset the queue
   *
   * @param  {Function} fn Function to map over elements in the queue
   * @return {Array}       The result of the map operation or an empty array.
   */
  reset(fn) {
    try {
      return fn ? this.queue.slice(this.offset).map(fn) : [];
    } finally {
      this.queue = [];
      this.offset = 0;
    }
  }
};
