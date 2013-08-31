/**
 * Module exports
 */

var debug = require('simple-debug')('flokk-auth');
var stack = require('simple-stack-common');
var consulate = require('consulate');
var token = require('consulate-simple-secrets');
var validate = require('consulate-validate-redirect-uri');
var authcode = require('consulate-authcode-simple-secrets');
var authcodeRedis = require('consulate-authcode-simple-secrets-redis');
var scrypt = require('consulate-scrypt');
var scopes = require('consulate-scopes-env');
var flokk = require('./lib/api');
var cache = require('./lib/cache');
var mail = require('./lib/mail');
var facebook = require('consulate-facebook');
var google = require('consulate-google');
var env = require('envs');
var ss = require('simple-secrets');

/**
 * Create a consulate server
 */

var app = consulate({
  session: {
    secret: env('COOKIE_SECRET', 'flokk rocks')
  }
});

/**
 * Configure the app
 */

app.set('view engine', 'jade');

/**
 * Initialize the Mandrill client
 */

mail.init(env('MANDRILL_KEY'));

/**
 * Initialize the signup simple-secrets
 */

var signup = ss(new Buffer(env('SIGNUP_SECRET'), 'hex'));

/**
 * Expose the site url to the views
 */

app.locals({
  dev: env('NODE_ENV') === 'development'
});

/**
 * Register the simple-secrets token plugin
 */

app.plugin(token({
  key: env('ACCESS_TOKEN_KEY')
}));

/**
 * Register the validate redirect-uri plugin
 */

app.plugin(validate());

/**
 * Register the simple-secrets authcode plugin
 */

app.plugin(authcode({
  key: env('AUTH_CODE_KEY')
}, authcodeRedis({
  url: env('AUTH_CODE_REDIS_URL')
})));

/**
 * Register the scrypt plugin
 */

app.plugin(scrypt());

/**
 * Register the scopes plugin
 */

app.plugin(scopes({
  placeholder: '_'
}));

/**
 * Register the flokk plugin
 */

var api = app.plugin(flokk({
  root: env('API_URL', 'https://api.theflokk.com'),
  client_id: env('AUTH_CLIENT_ID', 'flokk-auth'),
  scopes: env('AUTH_API_SCOPES', '').split(','),
  cache: cache(env('API_CACHE_URL'))
}));

/**
 * Patch the original url method in passport-oauth so we can use relative urls with `req.base`
 */

require('passport-oauth/lib/passport-oauth/strategies/utils').originalURL = function(req) {
  return req.base;
};

/**
 * Register the facebook plugin
 */

app.plugin(facebook({
  clientID: env('FACEBOOK_CLIENT_ID'),
  clientSecret: env('FACEBOOK_CLIENT_SECRET'),
  path: '/login/facebook',
  authOpts: { scope: ['email', 'user_birthday'] },
  name: 'facebook-prod',
  passReqToCallback: true
}, userByFacebook));

/**
 * Register an alternative facebook plugin for test environments
 */

if (env('FACEBOOK_CLIENT_ID_ALT')) {
  app.plugin(facebook({
    clientID: env('FACEBOOK_CLIENT_ID_ALT'),
    clientSecret: env('FACEBOOK_CLIENT_SECRET_ALT'),
    path: '/login/facebook-alt',
    authOpts: { scope: ['email', 'user_birthday'] },
    name: 'facebook-alt',
    passReqToCallback: true
  }, userByFacebook));
}

/**
 * Get or create a user by their facebook id
 *
 * @api private
 */

function userByFacebook(req, accessToken, refreshToken, profile, done) {
  api.userByFacebook(req.get('x-api-url'), profile, accessToken, refreshToken, done);
};

/**
 * Register the google plugin
 */

app.plugin(google({
  returnURL: env('GOOGLE_RETURN_URL'),
  realm: env('GOOGLE_REALM')
}, function(identifier, profile, done) {
  api.userByGoogle(profile, identifier, done);
}));

/**
 * Login view
 */

app.loginView(function(req, res) {
  res.render('login', {title: 'Login'});
});

/**
 * Authorize view
 */

app.authorizeView(function(req, res) {
  res.render('authorize', {title: 'Authorize'});
});

/**
 * Signup view
 */

app.get('/signup', function(req, res, next) {
  res.render('signup', {title: 'Signup'});
});

/**
 * Signup view
 */

app.post('/signup', function(req, res, next) {
  var form = {
    email: req.body.email,
    password: req.body.password,
    name: req.body.name
  };

  api.createUser(req.get('x-api-url'), form, function(err, user) {
    if (err) return next(err);

    req.logIn(user, function(err) {
      if (err) return next(err);

      var returnTo = req.session.returnTo || res.locals.authorizePath;
      // Delete it
      delete req.session.returnTo;

      res.redirect(returnTo);

      // Redirect to where we came from
      debug('user logged in; redirecting to', returnTo);

      var confirmation = req.base + '/confirm?code=' + signup.pack({
        id: user.id,
        date: Date.now()
      });

      mail('signup')
        .to(form.email, form.name)
        .set({
          name: form.name || form.email,
          confirmation: confirmation
        })
        .end(function(err, res) {
          if (err) console.error(err);
          if (res.error) console.error(new Error(res.text));
        });
    });
  });
});

/**
 * Expose confirmation url
 */

app.get('/confirm', function(req, res, next) {
  if (!req.query.code) return next(new Error('Missing confirmation code'));
  var info = signup.unpack(req.query.code);
  if (!info) return next(new Error('Invalid confirmation code'));

  // TODO report the time it took for people to confirm their account

  api.confirmUser(req.get('x-api-url'), info.id, function(err) {
    if (err) return next(err);
    res.render('confirm');
  });
});

/**
 * Logout of flokk
 */

app.get('/logout', function(req, res, next) {
  req.logout();
  res.redirect(res.locals.site);
});

/**
 * Expose the server
 */

var server = module.exports = stack({
  base: {
    host: 'x-orig-host',
    path: 'x-orig-path',
    port: 'x-orig-port',
    proto: 'x-orig-proto'
  }
});

/**
 * Expose the request locals to the view
 */

server.useBefore('router', function locals(req, res, next) {
  res.locals.base = req.base;
  res.locals.resolve = req.resolve;
  res.locals.site = req.get('x-ui-url') || env('SITE_URL', 'https://www.theflokk.com');
  res.locals.facebook = req.get('x-env') === 'production'
    ? '/facebook'
    : '/facebook-alt';
  next();
});

/**
 * Serve the built assets
 *
 * @todo only serve in development, come up with a cdn strategy
 */

server.useBefore('router', '/public', 'assets', stack.middleware.static(__dirname+'/build'));

/**
 * Mount the consulate app
 */

server.replace('router', app);

/**
 * Handle errors gracefully
 */

server.use(function errorRenderer(err, req, res, next) {
  res.status(err.code || err.status || 500);
  res.render('error', {err: err, title: err.name});
});
