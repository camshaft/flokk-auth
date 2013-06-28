/**
 * Module exports
 */

var stack = require('simple-stack-common')
  , consulate = require('consulate')
  , ss = require('consulate-simple-secrets')
  , scopes = require('consulate-scopes-env')
  , scrypt = require('consulate-scrypt')
  , facebook = require('consulate-facebook')
  , google = require('consulate-google')
  , authcode = require('consulate-authcode-simple-secrets')
  , authcodeRedis = require('consulate-authcode-simple-secrets-redis')
  , envs = require('envs')
  , api = require('./api');

/**
 * Create a consulate server
 */

var app = consulate({
  session: {
    secret: envs('COOKIE_SECRET', 'flokk rocks'),
    key: '_oauth2_session'
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
  site: envs('SITE_URL', 'http://theflokk.com')
});

/**
 *
 */

app.plugin(scopes({

}));

/**
 *
 */

app.plugin(authcode({
  key: envs('AUTHCODE_SECRET')
}, authcodeRedis({
  
})));

/**
 * Register the simple-secrets plugin
 */

app.plugin(ss({
  key: envs('SECRET')
}));

/**
 * Register the scrypt plugin
 */

app.plugin(scrypt());

// /**
//  * Register the facebook plugin
//  */

// app.plugin(facebook({
//   clientID: envs('FACEBOOK_CLIENT_ID'),
//   clientSecret: envs('FACEBOOK_CLIENT_SECRET'),
//   callbackURL: envs('FACEBOOK_CALLBACK_URL')
// }, function(accessToken, refreshToken, profile, done) {
//   // TODO store the profile in the db and lookup a 'flokk' user
//   done(null, profile);
// }));

// /**
//  * Register the google plugin
//  */

// app.plugin(google({
//   returnURL: envs('GOOGLE_RETURN_URL'),
//   realm: envs('GOOGLE_REALM')
// }, function(identifier, profile, done) {
//   // TODO store the profile in the db and lookup a 'flokk' user
//   done(null, profile);
// }));

/**
 * Register the api plugin
 */

app.plugin(api({
  client_id: envs('FLOKK_AUTH_CLIENT_ID'),
  key: envs('SECRET'),
  root: envs('API_ROOT'),
  scopes: ['auth:user', 'user:client']
}));

/**
 *
 */

app.isValidClientRedirectURI(function(client, callbackURL, done) {
  done(null, true);
});

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
