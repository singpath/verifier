'use strict';

const path = require('path');
const expect = require('expect.js');
const promiseFs = require('../src/promiseFs');
const pathExist = promiseFs.pathExist;
const readFile = promiseFs.readFile;

describe('pathExist', function() {

  it('should resolve to the file path the the file exist', () => {
    const expected = path.join(__dirname, '/fixtures/passes.txt');

    return pathExist(expected).then(
      filePath => expect(filePath).to.be(expected)
    );
  });

  it('should reject with an IOerror', () => {
    const filePath = './not.found';

    pathExist('./not.found').then(
      () => Promise.reject(new Error('The file should not exist.')),
      err => {
        expect(err.isIOError).to.be.ok();
        expect(err.path).to.be(filePath);
      }
    );
  });

});

describe('readFile', function() {

  it('should resolve to the file content', () => {
    const filePath = path.join(__dirname, '/fixtures/passes.txt');

    return readFile(filePath).then(
      content => expect(content.toString()).to.be('passes')
    );
  });

  it('should reject with an IOerror', () => {
    const filePath = './not.found';

    return readFile('./not.found').then(
      () => Promise.reject(new Error('The file should not exist.')),
      err => {
        expect(err.isIOError).to.be.ok();
        expect(err.path).to.be(filePath);
      }
    );
  });

});
