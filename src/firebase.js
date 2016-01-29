/**
 * Firebase service.
 *
 * TODO: refactor queue and verifier to use it.
 * TODO: should be its own module to share with other repo.
 */

'use strict';

const Firebase = require('firebase');
var Rx = require('rx-lite');

const VALID_ID = /^[-0-9a-zA-Z]{2,}$/;

const ERR_INVALID_ID = 'Invalid Firebase id.';

Firebase.prototype.observe = function(eventType) {
  return Rx.Observable.create(observer => {
    const handler = snapshot => observer.onNext(snapshot);
    const onError = err => observer.onError(err);

    this.on(eventType, handler, onError);

    return () => this.off(eventType, handler);
  });
};

Firebase.prototype.observeAuth = function() {
  return Rx.Observable.fromEventPattern(
    handler => this.onAuth(handler),
    handler => this.offAuth(handler)
  ).startWith(
    this.getAuth()
  );
};

exports.RxFirebase = Firebase;

/**
 * Create firebase service bound to one firebase ID.
 *
 * Usage:
 *
 *     const firebase = require('./firebase');
 *     const refFactory = firebase.factory('singpath');
 *     const someUseId = 'google:12345';
 *     const ref = refFactory(['auth/users', someUseId]);
 *
 *     // https://singpath.firebaseio.com/auth/users/google:12345
 *     console.log(ref.toString());
 *
 *     // using firebase +2.4.0 promises, to get a current value
 *     ref.once('value').then(snapshot => console.log(snapshot.val().displayName));
 *
 *     // using our observe method to get current value and monitor any changes.
 *     ref.observe('value').subscribe(snapshot => console.log(snapshot.val().displayName));
 *
 *
 * @param  {string}   id Firebase ID
 * @return {function}
 *
 */
exports.factory = function firebaseFactory(id) {
  if (!VALID_ID.test(id)) {
    throw new Error(ERR_INVALID_ID);
  }

  const rootPath = `https://${id}.firebaseio.com`;

  /**
   * Create firebase instance using a relative path
   *
   * @param  {string|array} path
   * @return {object}            RxFirebase instance
   *
   */
  return function firebase(path) {
    const components = path ? [rootPath].concat(path) : [rootPath];
    const ref = new exports.RxFirebase(components.join('/'));

    ref.ServerValue = Firebase.ServerValue;

    return ref;
  };
};
