/**
 * Module exports
 */
var stack = require("simple-stack-common")
  , envs = require("envs");

/**
 * Expose the app
 */
var app = module.exports = stack();

/**
 * Defines
 */
var SITE_URL = envs("SITE_URL", "http://theflokk.com");

/**
 * Configure the app
 */
app.set("view engine", "jade");

/**
 * Expose the site url to the views
 */
app.locals({
  site: SITE_URL
});

/**
 * Serve the built assets
 */
app.use("/public", stack.middleware.static(__dirname+"/build"));

app.useBefore("router", function localBase(req, res, next) {
  res.locals.base = req.base;
  res.locals.resolve = req.resolve;
  next();
});

/**
 * Routes
 */
app.get("/", function(req, res, next){
  res.render("login", {title: "Login"});
});

app.get("/signup", function(req, res, next){
  res.render("signup", {title: "Signup"});
});

app.post("/", function(req, res, next) {
  // Handle username/password
  res.send(204);
});
