'use strict';

const expect = require('expect.js');
const FIFO = require('../src/fifo.js').FIFO;


describe('FIFO', () => {
  it('should be empty', () => {
    const q = new FIFO();

    expect(q.length).to.be(0);
  });

  describe('push', () => {

    it('should add an element to the queue', () => {
      const q = new FIFO();

      q.push(1);
      expect(q.length).to.be(1);

      q.push(1);
      expect(q.length).to.be(2);
    });

  });

  describe('shift', () => {

    it('should remove an element to the queue and return it', () => {
      const q = new FIFO();

      q.push(1);
      expect(q.shift()).to.be(1);
      expect(q.length).to.be(0);
    });

    it('should return undefined if the q is empty', () => {
      const q = new FIFO();

      expect(q.shift()).to.be(undefined);
    });

    it('should keep old element while the buffer is not full', () => {
      const buffer = 5;
      const q = new FIFO(buffer);

      for (let i = 0; i < buffer; i++) {
        q.push(i);
        q.shift();
      }

      expect(q.length).to.be(0);
      expect(q.queue).to.have.length(buffer);
      expect(q.offset).to.be(buffer);
    });

    it('should remove old elements once the buffer is full', () => {
      const buffer = 5;
      const q = new FIFO(buffer - 1);

      for (let i = 0; i < buffer; i++) {
        q.push(i);
        q.shift();
      }

      expect(q.length).to.be(0);
      expect(q.queue).to.have.length(0);
      expect(q.offset).to.be(0);
    });

  });

});
