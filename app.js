/**
 * Module exports
 */

var stack = require('simple-stack-common')
  , consulate = require('consulate')
  , ss = require('consulate-simple-secrets')
  , scrypt = require('consulate-scrypt')
  , facebook = require('consulate-facebook')
  , google = require('consulate-google')
  , scopes = require('consulate-scopes-env')
  , db = require('./lib/database')
  , env = require('envs');

/**
 * Create a consulate server
 */

var app = consulate({
  session: {
    secret: env('COOKIE_SECRET', 'flokk rocks'),
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
  site: env('SITE_URL', 'http://theflokk.com'),
  dev: env('NODE_ENV') === 'development'
});

/**
 * Register the simple-secrets plugin
 */

app.plugin(ss({
  key: env('ACCESS_TOKEN_KEY')
}));

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
  db.getUserByFacebook(profile.id, function(err, user) {
    if (err) return done(err);
    if (user) return done(null, user);

    db.createUser({
      facebook: profile.id,
      username: profile.username,
      name: profile.displayName,
      emails: profile.emails
    }, done);
  });
}));

/**
 * Register the google plugin
 */

// app.plugin(google({
//   returnURL: env('GOOGLE_RETURN_URL'),
//   realm: env('GOOGLE_REALM')
// }, function(identifier, profile, done) {
//   db.getUserByGoogle(profile.id, function(err, user) {
//     if (err) return done(err);
//     if (user) return done(null, user);

//     db.createUser({
//       google: profile.id,
//       username: profile.username,
//       name: profile.displayName,
//       emails: profile.emails
//     }, done);
//   });
// }));

/**
 * Register the database plugin
 */
app.plugin(db({
  url: env('DATABASE_URL')
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
