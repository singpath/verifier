'use strict';

const path = require('path');
const expect = require('expect.js');
const promiseFs = require('../src/promiseFs');
const pathExist = promiseFs.pathExist;
const readFile = promiseFs.readFile;

describe('pathExist', function() {

  it('should resolve to the file path the the file exist', done => {
    const expected = path.join(__dirname, '/fixtures/passes.txt');

    pathExist(expected).then(filePath => {
      expect(filePath).to.be(expected);
      done();
    }).catch(
      err => done(err)
    );
  });

  it('should reject with an IOerror', done => {
    const filePath = './not.found';

    pathExist('./not.found').catch(err => {
      expect(err.isIOError).to.be.ok();
      expect(err.path).to.be(filePath);
      done();
      return Promise.reject(err);
    }).then(() => {
      done(new Error('The file should not exist.'));
    });
  });

});

describe('readFile', function() {

  it('should resolve to the file content', done => {
    const filePath = path.join(__dirname, '/fixtures/passes.txt');

    readFile(filePath).then(content => {
      expect(content.toString()).to.be('passes');
      done();
    }).catch(
      err => done(err)
    );
  });

  it('should reject with an IOerror', done => {
    const filePath = './not.found';

    readFile('./not.found').catch(err => {
      expect(err.isIOError).to.be.ok();
      expect(err.path).to.be(filePath);
      done();
      return Promise.reject(err);
    }).then(() => {
      done(new Error('The file should not exist.'));
    });
  });

});
