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
  next();
});

/**
 * Routes
 */
app.get("/", function(req, res, next){
  res.render("index");
});

app.get("/signup", function(req, res, next){
  res.render("signup");
});

app.post("/", function(req, res, next) {
  // Handle username/password
  res.send(204);
});
