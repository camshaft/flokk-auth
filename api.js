/**
 * Module dependencies
 */

var debug = require('simple-debug')('consulate-hyper')
  , ss = require("simple-secrets")
  , bitfield = require('bitfield')
  , superagent = require('superagent');

/**
 * Use an api that supports simple-secrets tokens to get user/client data for consulate
 * 
 * This plugin requires a few options
 * 
 * - {String} root The url to the root of the hyper api
 * - {String} client_id The client_id of the consulate server
 * - {String} key The simple-secrets signing key
 * - {Array} scopes A list of scopes required to complete these actions against the api
 * 
 * Optionally you may specify
 * 
 * - {Function} compressScope A function that compresses the token scopes
 * - {Function} set A function to cache responses
 * - {Function} get A function to retrieve cached responses
 * 
 * @param {Object} options
 * @api public
 */

module.exports = function(options) {

  var cache = {
    get: options.get || function(key, cb) {cb()},
    set: options.set || function(key, value, ttl, cb) {cb()}
  };

  return function(app) {

    app.user(function(id, done) {
      link('auth', function(err, users, token) {
        if (err) return done(err);
        submit(users, 'user', {id: id}, token, cache, function(err, res) {
          if (err) return done(err);
          if (!res.body.results || !res.body.results[0]) return done();
          follow({result: res.body.results[0]}, 'result', token, cache, function(err, res) {
            if (err) return done(err);
            done(null, res.body);
          });
        });
      });
    });

    app.userByUsername(function(username, done) {
      link('auth', function(err, users, token) {
        if (err) return done(err);
        submit(users, 'user', {username: username}, token, cache, function(err, res) {
          if (err) return done(err);
          if (!res.body.results || !res.body.results[0]) return done();
          follow({result: res.body.results[0]}, 'result', token, cache, function(err, res) {
            if (err) return done(err);
            done(null, res.body);
          });
        });
      });
    });

    app.client(function(id, done) {
      link('auth', function(err, clients, token) {
        if (err) return done(err);
        submit(clients, 'client', {id: id}, token, cache, function(err, res) {
          if (err) return done(err);
          if (!res.body.results || !res.body.results[0]) return done();
          follow({result: res.body.results[0]}, 'result', token, cache, function(err, res) {
            if (err) return done(err);
            done(null, res.body);
          });
        });
      });
    });

    // Save the `scopes` callback for compression
    var getScopes = app.callback('scopes');

    // Helper for traversing from the root to the desired resource
    function link(rel, done) {
      createToken(getScopes, options, function(err, token) {
        debug(err, token);
        if (err) return done(err);
        root(options.root, token, cache, function(err, res) {
          debug(err, res.body);
          if (err) return done(err);
          follow(res.body, rel, token, cache, function(err, res) {
            debug(err, res.body);
            if (err) return done(err);
            done(null, res.body, token);
          });
        });
      });
    };
  };
};

/**
 * Cache our created token so we don't generate it each time
 */

var _token;

/**
 * Create a token to be used by consulate
 * 
 * @param {Function} getScopes
 * @param {Object} options
 * @param {Function} done
 * @api private
 */

function createToken(getScopes, options, done) {
  // Return the cached token
  if (_token) return done(null, _token);

  getScopes(function(err, availableScopes) {
    if (err) return done(err);

    var client_id = options.client_id
      , scopes = options.scopes
      , compress = options.compressScope || bitfield.pack;

    // Create a sender
    var key = new Buffer(options.key, 'hex')
      , sender = ss(key);

    /**
     * Create a token for consulate to access internal apis restricted by the scopes, namely:
     * 
     * - Links
     *   - users
     *   - clients
     * 
     * - Forms
     *   - find user by id
     *   - find user by username
     *   - find client by id
     * 
     * - User Fields
     *   - passhash
     *   - id
     *   - name
     *   - allowed scopes
     *   - etc.
     */

    _token = sender.pack({
      s: compress(scopes, availableScopes),
      c: client_id
    });

    done(null, _token);
  });
};

/**
 * Make a request to the root resource
 * 
 * @param {String} rootURL
 * @param {String} token
 * @param {Function} done
 */

function root(rootURL, token, cache, done) {
  follow({root: {href: rootURL}}, 'root', token, cache, done);
};

/**
 * Follow a link from a resource
 * 
 * @param {Object} resource
 * @param {String} rel
 * @param {String} token
 * @param {Function} done
 */

function follow(resource, rel, token, cache, done) {
  var href = resource[rel].href;

  cache.get(href, function(err, value) {
    // ignore the error
    if (err) debug(err);

    // We have a cache hit
    if (value) return done(null, value);

    superagent
      .get(href)
      .set('authorization', 'Bearer '+token)
      .end(function(err, res) {
        if (err) return done(err);
        if (res.error) return done(res.error);

        var ttl = 3600; // TODO parse the cache-control headers

        cache.set(href, res.body, ttl, function(err) {
          done(null, res);
        });
      });
  });
};

/**
 * Submit a form from a resource
 * 
 * @param {Object} resource
 * @param {String} rel
 * @param {Object} params
 * @param {String} token
 * @param {Function} done
 */

function submit(resource, rel, params, token, cache, done) {
  // TODO cache this
  var form = resource[rel]
    , method = form.method.toUpperCase()
    , action = form.action;

  var request = superagent(method, action)
    .set('authorization', 'Bearer '+token);

  // Send the params as a query if we're using 'GET' - otherwise send it as a json body
  if (method === 'GET') request.query(params);
  else request.send(params);

  request.end(done);
};
