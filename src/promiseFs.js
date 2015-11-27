'use strict';

const fs = require('fs');

exports.pathExist = pathExist;
exports.readFile = readFile;

class IOError extends Error {

  constructor(msg, path) {
    super(msg);
    this.path = path;
    this.isIOError = true;
  }

}

/**
 * Return a Promise resolving to the path if it exist. It will reject if
 * the file is not found
 *
 * @param  {string}  filePath Path to test.
 * @return {Promise}
 */
function pathExist(filePath) {
  return new Promise((resolve, reject) => {
    fs.exists(filePath, (found) => {
      if (found) {
        resolve(filePath);
      } else {
        reject(new IOError(`Path (${filePath}) not found.`, filePath));
      }
    });
  });
}

/**
 * Return a promise resolving to the content of the file.
 *
 * It will reject if the file doesn't exist or cannot be read
 *
 * @param  {string}  filePath File to read.
 * @return {Promise}
 */
function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(new IOError(err.toString(), filePath));
      } else {
        resolve(data);
      }
    });
  });
}
