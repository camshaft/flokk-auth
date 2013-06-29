/**
 * Module dependencies
 */

var debug = require('simple-debug')('flokk-auth:api')
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
  return function(app) {

    // Save the `scopes` callback for compression
    var getScopes = app.callback('scopes');

    var api = new API(options, getScopes);

    app.user(function(id, done) {
      api.user(id, done);
    });

    app.userByUsername(function(username, done) {
      api.userByUsername(username, done);
    });

    app.client(function(id, done) {
      api.client(id, done);
    });

    // app.userDecision(function(user, client, done) {
    //   var decision = find(user.decisions, {client:{id: client.id}});
    //   done(null, decision);
    // });

    // app.saveUserDecision(function(id, done) {
    //   api.saveUserDecision(id, decision, done);
    // });

    return api;
  };
};

function API(options, getScopes) {
  this.cache = options.cache || {
    get: function(key, cb) {cb()},
    set: function(key, value, ttl, cb) {cb()}
  };

  this.key = options.key;
  this.client_id = options.client_id;
  this.scopes = options.scopes;
  this.compress = options.compressScope || bitfield.pack;
  this._root = options.root;
  this.getScopes = getScopes;
  this._token;
};

API.prototype.user = function(id, done) {
  this._userSearch({id: id}, done);
};

API.prototype.userByUsername = function(username, done) {
  this._userSearch({username: username}, done);
};

API.prototype.userByFacebook = function(facebook, accessToken, refreshToken, done) {
  var self = this;
  self._userSearch({facebook: facebook.id}, function(err, user) {
    if (err) return done(err);
    if (user) return done(null, user);

    // TODO figure out any other of fields we need
    self.createUser({
      'facebook': facebook.id,
      'name': facebook.name,
      'gender': facebook.gender,
      'birthday': facebook.birthday,
      'locale': facebook.locale
    }, done);
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
  self.link('auth', function(err, auth) {
    debug('get link auth', err, auth);
    if (err) return done(err);

    self.submit(auth, 'user', query, function(err, res) {
      if (err) return done(err);
      if (!res.body.results || !res.body.results[0]) return done();

      self.follow({result: res.body.results[0]}, 'result', function(err, res) {
        if (err) return done(err);
        done(null, res.body);
      });
    });
  });
};

API.prototype.createUser = function(user, done) {
  var self = this;
  self.link('auth', function(err, auth) {
    debug('get link auth', err, auth);
    if (err) return done(err);

    self.submit(auth, 'create-user', user, function(err, res) {
      if (err) return done(err);
      if (!res.body) return done(null, null);

      done(null, res.body);
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
  self.link('auth', function(err, auth) {
    if (err) return done(err);

    self.submit(auth, 'client', {id: id}, function(err, res) {
      if (err) return done(err);
      if (!res.body.results || !res.body.results[0]) return done();

      self.follow({result: res.body.results[0]}, 'result', function(err, res) {
        if (err) return done(err);

        var client = res.body;
        client.scope = client.scopes;

        done(null, client);
      });
    });
  });
};

/**
 * Create a token to be used by consulate
 * 
 * @param {Function} getScopes
 * @param {Object} options
 * @param {Function} done
 * @api private
 */

API.prototype.createToken = function(done) {
  var self = this;

  debug('creating access token');

  // Return the cached token
  if (self._token) return done();

  self.getScopes(function(err, availableScopes) {
    if (err) return done(err);

    // Create a sender
    var key = new Buffer(self.key, 'hex')
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

    self._token = sender.pack({
      s: self.compress(self.scopes, availableScopes),
      c: self.client_id
    });

    done(null);
  });
  
};

API.prototype.link = function(rel, done) {
  var self = this;
  self.createToken(function(err) {
    if (err) return done(err);

    self.root(function(err, res) {
      debug(err, res.body);
      if (err) return done(err);

      self.follow(res.body, rel, function(err, res) {
        debug(err, res.body);
        if (err) return done(err);

        done(null, res.body);
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

  var href = resource[rel].href;

  self.cache.get(href, function(err, value) {
    // ignore the error
    if (err) debug(err);

    // We have a cache hit
    if (value) return done(null, value);

    superagent
      .get(href)
      .set('authorization', 'Bearer '+self.token)
      .end(function(err, res) {
        if (err) return done(err);
        if (res.error) return done(res.error);

        var ttl = parseCacheControl(res.headers['cache-control'])['max-age'] || 60;

        self.cache.set(href, res.body, ttl, function(err) {
          // ignore the error
          if (err) debug(err);

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

API.prototype.submit = function(resource, rel, params, done) {
  // TODO cache this
  var form = resource[rel]
    , method = form.method.toUpperCase()
    , action = form.action;

  var request = superagent(method, action)
    .set('authorization', 'Bearer '+this.token);

  // Send the params as a query if we're using 'GET' - otherwise send it as a json body
  if (method === 'GET') request.query(params);
  else request.send(params);

  request.end(done);
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
