/**
 * Module dependencies
 */

var debug = require('simple-debug')('flokk-auth:api')
  , scrypt = require('scrypt').passwordHash
  , envs = require('envs')
  , superagent = require('superagent');

/**
 * Defines
 */

var SCRYPT_MAX_TIME = envs('SCRYPT_MAX_TIME', 1);

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
  return function(app) {

    // Save the `scopes` callback for compression
    var getScopes = app.callback('scopes')
      , issueToken = app.callback('issueToken');

    var api = new API(options, getScopes, issueToken);

    app.user(function(id, done) {
      api.user(id, done);
    });

    app.userByUsername(function(email, done) {
      api.userByEmail(email, done);
    });

    app.client(function(id, done) {
      api.client(id, done);
    });

    app.userDecision(function(user, client, done) {
      // All internal clients are approved
      console.log(client);
      if (client.internal) return done(null, true);
      // TODO load from the api
      done();
    });

    // app.saveUserDecision(function(id, done) {
    //   api.saveUserDecision(id, decision, done);
    // });

    return api;
  };
};

function API(options, getScopes, issueToken) {
  this.cache = options.cache || {
    get: function(key, cb) {cb()},
    set: function(key, value, ttl, cb) {cb()}
  };

  this.client_id = options.client_id;
  this.scopes = options.scopes;
  this._root = options.root;
  this.getScopes = getScopes;
  this.issueToken = issueToken;
  this._token;
};

API.prototype.user = function(id, done) {
  this._userSearch({id: id}, done);
};

API.prototype.userByEmail = function(email, done) {
  this._userSearch({email: email}, done);
};

API.prototype.userByFacebook = function(facebook, accessToken, refreshToken, done) {
  var self = this;
  debug('searching for user by facebook id', facebook.id);
  self._userSearch({facebook: facebook.id}, function(err, user) {
    if (err) return done(err);
    if (user) return done(null, user);

    self.link('users', function(err, users) {
      if (err) return done(err);
      debug(users);

      // TODO figure out any other of fields we need
      self.submit(users, 'create', {
        'facebook': facebook.id,
        'name': facebook.displayName,
        'gender': facebook.gender,
        'birthday': Math.floor((new Date(facebook.birthday)).getTime() / 1000),
        'locale': facebook.locale,
        'email': facebook.email
      }, function(err, res) {
        if (err) return done(err);
        debug(res.body);
        if (!res.body) return done(null, null);

        done(null, res.body);
      });
    });
  });
};

API.prototype.userByGoogle = function(google, identifier, done) {
  var self = this;
  this._userSearch({google: google.id}, function(err, user) {
    if (err) return done(err);
    if (user) return done(null, user);

    self.createUser({

    }, done);
  });
};

API.prototype._userSearch = function(query, done) {
  var self = this;
  self.link('users', function(err, users) {
    if (err) return done(err);
    debug(users);

    self.submit(users, 'find', query, function(err, res) {
      if (err) return done(err);
      debug(res.body);
      if (!res.body.results || !res.body.results[0]) return done();

      self.follow({result: res.body.results[0]}, 'result', function(err, user) {
        if (err) return done(err);
        debug(user);
        done(null, user);
      });
    });
  });
};

API.prototype.createUser = function(user, done) {
  var self = this;
  self.link('users', function(err, users) {
    if (err) return done(err);
    debug(users);

    scrypt(user.password, SCRYPT_MAX_TIME, function(err, passhash) {
      user.passhash = passhash;
      delete user.password;

      debug(user);

      self.submit(users, 'create', user, function(err, res) {
        if (err) return done(err);
        debug(res.body);
        if (!res.body) return done(null, null);

        done(null, res.body);
      });
    });
  });
};

API.prototype.saveUserDecision = function(user, decision, done) {
  var self = this;
  self.submit(user, 'decide', decision, function(err, res) {
    if (err) return done(err);
    done(null);
  });
};

API.prototype.client = function(id, done) {
  var self = this;
  self.link('clients', function(err, clients) {
    if (err) return done(err);

    self.submit(clients, 'find', {id: id}, function(err, res) {
      if (err) return done(err);
      debug(res.body);
      if (!res.body.results || !res.body.results[0]) return done();

      self.follow({result: res.body.results[0]}, 'result', function(err, client) {
        if (err) return done(err);
        debug(client);

        client.scope = client.scopes;

        done(null, client);
      });
    });
  });
};

/**
 * Create a token to be used by consulate
 *
 * This needs to include the scopes needed to access internal apis for auth
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
 *
 * @param {Function} getScopes
 * @param {Object} options
 * @param {Function} done
 * @api private
 */

API.prototype.createToken = function(done) {
  var self = this;

  // Return the cached token
  if (self._token) return done();

  debug('creating access token');

  self.issueToken({client_id: self.client_id}, null, self.scopes, function(err, token) {
    if (err) return done(err);

    self._token = token;

    debug('auth token created', self._token);

    done(null);
  });
};

API.prototype.link = function(rel, done) {
  var self = this;
  self.createToken(function(err) {
    if (err) return done(err);

    self.root(function(err, root) {
      if (err) return done(err);
      debug(root);

      self.follow(root, rel, function(err, body) {
        if (err) return done(err);
        debug(body);

        done(null, body);
      });
    });
  });
};

/**
 * Make a request to the root resource
 * 
 * @param {Function} done
 */

API.prototype.root = function(done) {
  this.follow({root: {href: this._root}}, 'root', done);
};

/**
 * Follow a link from a resource
 * 
 * @param {Object} resource
 * @param {String} rel
 * @param {Function} done
 */

API.prototype.follow = function(resource, rel, done) {
  var self = this;

  if (!resource[rel] || !resource[rel].href) return done(new Error('Invalid link with rel "'+rel+'"'));

  var href = resource[rel].href;

  self.cache.get(href, function(err, value) {
    // ignore the error
    if (err) debug(err);

    // We have a cache hit
    if (value) return done(null, value);

    superagent
      .get(href)
      .set('authorization', 'Bearer '+self._token)
      .end(function(err, res) {
        if (err) return done(err);
        if (res.error) return done(res.error);

        var ttl = parseCacheControl(res.headers['cache-control'])['max-age'] || 60;

        self.cache.set(href, res.body, ttl, function(err) {
          // ignore the error
          if (err) debug(err);

          done(null, res.body);
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
 * @param {Function} done
 */

API.prototype.submit = function(resource, rel, params, done) {
  // TODO cache this
  var form = resource[rel]

  if (!form) return done(new Error('Invalid form with rel "'+rel+'"'));

  var method = form.method.toUpperCase()
    , action = form.action;

  var request = superagent(method, action)
    .set('authorization', 'Bearer '+this._token);

  // Send the params as a query if we're using 'GET' - otherwise send it as a json body
  if (method === 'GET') request.query(params);
  else request.send(params);

  request.end(function(err, res) {
    if (err) return done(err);
    if (res.error) return done(res.error);

    done(null, res);
  });
};

/**
 * Parse the given Cache-Control `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseCacheControl(str) {
  var directives = str.split(',')
    , obj = {};

  for(var i = 0, len = directives.length; i < len; i++) {
    var parts = directives[i].split('=')
      , key = parts.shift().trim()
      , val = parseInt(parts.shift(), 10);

    obj[key] = isNaN(val) ? true : val;
  }

  return obj;
};
