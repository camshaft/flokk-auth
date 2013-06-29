/**
 * Module dependencies
 */

var redis = require('redisurl');

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
  this.conn.get(key, done);
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

RedisCache.prototype.save = function(key, value, ttl, done) {
  if (!this.conn.ready) return done();
  this.conn.multi()
    .set(key, value)
    .expire(key, ttl)
    .exec(done);
  return this;
};
