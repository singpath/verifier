/**
 * Authentication service
 */

'use strict';


// List function to convert firebase auth object to a flat auth object.
const normalisers = {
  google(authData) {
    return {
      uid: authData.uid,
      email: authData.google.email,
      displayName: authData.google.displayName,
      isUser: true,
      isWorker: false,
      queue: undefined
    };
  },

  generic(authData) {
    return {
      uid: authData.uid,
      displayName: 'John Doe',
      isUser: authData.auth && !authData.auth.isWorker || false,
      isWorker: authData.auth && authData.auth.isWorker || false,
      queue: authData.auth && authData.auth.queue || null
    };
  }
};

/**
 * Filter and flatten firebase auth data object.
 *
 * @param  {Object} auth
 * @return {Object}
 *
 */
function normaliseAuth(auth) {
  if (!auth) {
    return;
  }

  const normaliser = normalisers[auth.provider] || normalisers.generic;

  return normaliser(auth);
}

// protected keys symbols (not iterable)
const authRefKey = Symbol('ref');
const authStatusKey = Symbol('status');
const authLoginKey = Symbol('login');


/**
 * Authentication service.
 *
 * Allows to follow the current user auth status, to log him/her in/out and
 * to register him/her.
 *
 */
exports.Auth = class Auth {

  /**
   * Save the dependencies, and initiate a shared root firebase object stream
   * and an authentication stream.
   *
   * @param  {Object} firebase Singpath firebase service.
   */
  constructor(firebase) {
    this[authRefKey] = firebase();

    // Shared streams of the current auth status.
    this[authStatusKey] = this[authRefKey].observeAuth().map(
      auth => normaliseAuth(auth)
    ).shareReplay(1);

    // To share concurent login request.
    this[authLoginKey] = undefined;
  }

  /**
   * Returns a shared authentication status stream
   *
   * Emits:
   * - undefined or null when the user is logged off;
   * - a flattened auth data object including his/her uid, email and
   *   displayName.
   *
   * @return {Observable} [description]
   */
  status() {
    return this[authStatusKey];
  }

  /**
   * Log user in.
   *
   * TODO: handle other form of login.
   *
   * @param  {string} token
   * @return {Promise}      Resolve once the user is logged in.
   */
  login(token) {
    if (this[authLoginKey]) {
      return this[authLoginKey];
    }

    this.logout();
    this[authLoginKey] = this[authRefKey].authWithCustomToken(token).then(authData => {
      this[authLoginKey] = undefined;
      return authData;
    });

    return this[authLoginKey];
  }

  /**
   * Log user out.
   *
   * @return {Promise}     Promise resolving the un-authentication completes.
   */
  logout() {
    return this[authRefKey].unauth();
  }
};
