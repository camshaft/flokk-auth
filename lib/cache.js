/**
 * Module dependencies
 */

var redis = require('redisurl');

/**
 * Expose RedisCache
 */

module.exports = RedisCache;

/**
 * RedisCache
 *
 * @param {String} url
 */

function RedisCache(url) {
  if (!(this instanceof RedisCache)) return new RedisCache(url);
  this.conn = redis(url);
};

/**
 * Get a cached key
 *
 * @param {String} key
 * @param {Function} done
 * @return {RedisCache}
 */

RedisCache.prototype.get = function(key, done) {
  if (!this.conn.ready) return done();
  this.conn.get(key, function(err, value) {
    if (err) return done(err);
    if (value) done(null, JSON.parse(value));
    done();
  });
  return this;
};

/**
 * Save a value with an expiration under a key
 *
 * @param {String} key
 * @param {Any} value
 * @param {Integer} ttl
 * @param {Function} done
 * @return {RedisCache}
 */

RedisCache.prototype.set = function(key, value, ttl, done) {
  if (!this.conn.ready) return done();
  this.conn.multi()
    .set(key, JSON.stringify(value))
    .expire(key, ttl)
    .exec(done);
  return this;
};
