/**
 * Module dependencies
 */
var env = require('envs');

/**
 * Scopes
 */

module.exports = function(placeholder) {
  var placeholder = placeholder || 'null';

  var scopes = env('SCOPES', '')
    .split(',')
    .map(function(scope) { return scope === placeholder ? null : scope });

  return function(app) {
    app.scopes(function(done) {
      done(null, scopes);
    });
  };
};
