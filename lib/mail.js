/**
 * Module dependencies
 */

var request = require('superagent');
var envs = require('envs');

var MANDRILL_API_ROOT = envs('MANDRILL_API_ROOT', 'https://mandrillapp.com/api/1.0/messages/send-template.json');
var MANDRILL_KEY;

exports = module.exports = function(template) {
  return new Message(template);  
};

exports.init = function(key) {
  MANDRILL_KEY = key;
};

function Message(template) {
  this.data = {
    key: MANDRILL_KEY,
    template_name: template,
    template_content: [],
    message: {
      to: [],
      global_merge_vars: []
    }
  };
};

Message.prototype.template = function(template) {
  this.data.template_name = template;
  return this;
};

Message.prototype.to = function(email, name) {
  this.data.message.to.push({
    email: email,
    name: name
  });
  return this;
};

Message.prototype.from = function(email, name) {
  this.data.message.from_email = email;
  this.data.message.from_name = name;
  return this;
};

Message.prototype.set = function(key, value) {
  var self = this;
  if (typeof key === 'object') {
    Object.keys(key).forEach(function(k) {
      self.set(k, key[k]);
    });
    return this;
  }

  this.data.message.global_merge_vars.push({
    name: key,
    content: value
  });
  return this;
};

Message.prototype.end = function(fn) {
  request
    .post(MANDRILL_API_ROOT)
    .send(this.data)
    .end(fn)
};
