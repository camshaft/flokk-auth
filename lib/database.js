/**
 * Module dependencies
 */

db = exports = module.exports = function() {
  return function(app) {
    app
      .user(db.getUser)
      .userByUsername(db.getUserByUsername)
      .client(db.getClient)
      .authorizationCode(db.getAuthorizationCode)
      .createAuthorizationCode(db.createAuthorizationCode)
      .invalidateAuthorizationCode(db.invalidateAuthorizationCode);
  };
};

var users = [];

var clients = [
  {
    id: 'client123',
    name: 'Flokk',
    description: 'Start a sale. Collaborate.',
    secret: 'super+secret',
    redirect_uri: ['http://localhost:5000/auth/callback'],
    scope: ['user:name', 'user:email']
  }
];

var authorizationCodes = [];

db.getUser = function(id, cb) {
  cb(null, find(users, function(user) {
    return user.id == id;
  }));
};

db.getUserByUsername = function(username, cb) {
  var user = find(users, function(user) {
    return user.username == username;
  });
  cb(null, user);
};

db.getUserByFacebook = function(facebookID, cb) {
  var user = find(users, function(user) {
    return user.facebook === facebookID;
  });
  cb(null, user);
};

db.createUser = function(user, cb) {
  user.id = users.length;
  users.push(user);
  cb(null, user);
};

db.getClient = function(id, cb) {
  cb(null, find(clients, function(client) {
    return client.id == id;
  }));
};

db.getAuthorizationCode = function(id, cb) {
  cb(null, authorizationCodes[id]);
};

db.createAuthorizationCode = function(client, redirectURI, user, ares, cb) {
  var authCode = {
    user_id: user.id,
    client_id: client.id,
    redirect_uri: redirectURI,
    scope: client.scope
  };
  var code = authorizationCodes.length;
  authorizationCodes.push(authCode);
  cb(null, ''+code);
};

db.invalidateAuthorizationCode = function(code, cb) {
  delete authorizationCodes[code]
  cb();
};

function find(list, fn) {
  for (var i = 0; i < list.length; i++) {
    if (fn(list[i])) return list[i];
  }
  return null;
};
