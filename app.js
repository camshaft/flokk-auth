/**
 * Module exports
 */
var stack = require("simple-stack-common");

/**
 * Expose the app
 */
var app = module.exports = stack();

/**
 * Configure the app
 */
app.set("view engine", "jade");

app.locals({
  site: process.env.SITE || "http://www.theflokk.com"
})

/**
 * Serve the built assets
 */
app.use("/public", stack.middleware.static(__dirname+"/build"));

app.useBefore("router", function localBase(req, res, next) {
  res.locals.base = req.base;
  res.locals.resolve = req.resolve;
  next();
});

app.useBefore("router", function bareView(req, res, next) {
  res.locals.bare = !!req.query.bare;
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
