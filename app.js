/**
 * Module exports
 */

var stack = require('simple-stack-common')
  , consulate = require('consulate')
  , token = require('consulate-simple-secrets')
  , validate = require('consulate-validate-redirect-uri')
  , authcode = require('consulate-authcode-simple-secrets')
  , authcodeRedis = require('consulate-authcode-simple-secrets-redis')
  , scrypt = require('consulate-scrypt')
  , scopes = require('consulate-scopes-env')
  , facebook = require('consulate-facebook')
  , google = require('consulate-google')
  , flokk = require('./lib/api')
  , env = require('envs');

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
 * Expose the site url to the views
 */

app.locals({
  site: env('SITE_URL', 'https://www.theflokk.com'),
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

app.plugin(scopes());

/**
 * Register the facebook plugin
 */

app.plugin(facebook({
  clientID: env('FACEBOOK_CLIENT_ID'),
  clientSecret: env('FACEBOOK_CLIENT_SECRET'),
  callbackURL: env('FACEBOOK_CALLBACK_URL')
}, function(accessToken, refreshToken, profile, done) {
  api.getUserByFacebook(profile, accessToken, refreshToken, done);
}));

/**
 * Register the google plugin
 */

app.plugin(google({
  returnURL: env('GOOGLE_RETURN_URL'),
  realm: env('GOOGLE_REALM')
}, function(identifier, profile, done) {
  api.getUserByGoogle(profile, identifier, done);
}));

/**
 * Register the flokk plugin
 */

var api = app.plugin(flokk({
  key: env('ACCESS_TOKEN_KEY'),
  root: env('API_URL', 'https://api.theflokk.com'),
  client_id: env('AUTH_CLIENT_ID', 'flokk-auth'),
  scopes: env('AUTH_API_SCOPES', '').split(',')
  // TODO setup cache
  // get: function() {},
  // set: function() {}
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
  // TODO should we have some kind of a welcome page?
  // or should the UI handle that...

  api.createUser(req.body, function(err, user) {
    if (err) return next(err);

    req.logIn(user, function(err) {
      if (err) return next(err);

      var returnTo = req.session.returnTo || res.locals.authorizePath;
      // Delete it
      delete req.session.returnTo;

      // Redirect to where we came from
      debug('user logged in; redirecting to', returnTo);
      return res.redirect(returnTo);
    });
  });
});

/**
 * Expose the server
 */

var server = module.exports = stack();

/**
 * Expose the `base` to the view
 */

server.use(function localBase(req, res, next) {
  res.locals.base = req.base;
  res.locals.resolve = req.resolve;
  next();
});

/**
 * Serve the built assets
 *
 * @todo only serve in development, come up with a cdn strategy
 */

server.use('/public', 'assets', stack.middleware.static(__dirname+'/build'));

/**
 * Mount the consulate app
 */

server.use(app);

/**
 * Handle errors gracefully
 */
server.use(function errorRenderer(err, req, res, next) {
  res.render('error', {err: err, title: err.name});
});
