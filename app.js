const createError = require("http-errors");
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const path = require("path");
const cookieParser = require("cookie-parser");
const health = require("./middleware/healthcheck");
const logger = require("morgan");
const sassMiddleware = require("node-sass-middleware");
const Sentry = require("@sentry/node");
const { Integrations: ApmIntegrations } = require("@sentry/apm");
const { default: sslRedirect } = require("heroku-ssl-redirect");

const indexRouter = require("./routes/index");
const apiRouter = require("./routes/api");
const showcaseRouter = require("./routes/showcase");
const frbRouter = require("./routes/frb");

const pkg = require("./package.json");
const app = express();
const isProduction = process.env.NODE_ENV == "production";

if (isProduction) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: `${pkg.name}@${process.env.HEROKU_SLUG_COMMIT.substring(0, 8)}`,
    integrations: [
      new ApmIntegrations.Tracing(),
    ],
    tracesSampleRate: 0.5
  });

  app.use(Sentry.Handlers.requestHandler());
}

// view engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(sassMiddleware({
  src: path.join(__dirname, "public"),
  dest: path.join(__dirname, "public"),
  indentedSyntax: false, // true = .sass and false = .scss
  sourceMap: true
}));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "node_modules/")));

// setup healthcheck
health.check(app);
// redirect old to new host
app.use(require("./middleware/redirect-jga"));

app.use((req, res, next) => {
  res.locals.CDN_HOST = process.env.CDN_HOST;
  res.locals.WEB_HOST = process.env.WEB_HOST;
  res.locals.API_HOST = process.env.API_HOST;
  res.locals.ADVICEBUILDER_HOST = process.env.ADVICEBUILDER_HOST;
  res.locals.API_KEY = process.env.API_KEY;
  res.locals.GTAG_ID = process.env.GTAG_ID;
  res.locals.INTERCOM_APP_ID = process.env.INTERCOM_APP_ID;
  res.locals.SENTRY_DSN = process.env.SENTRY_DSN;
  res.locals._ = require("lodash");
  const [, sentryVersionApm] = pkg.dependencies["@sentry/apm"].split("^");
  const [, sentryVersionBrowser] = pkg.dependencies["@sentry/browser"].split("^");
  res.locals.SENTRY_VERSION_APM = sentryVersionApm;
  res.locals.SENTRY_VERSION_BROWSER = sentryVersionBrowser;
  next();
});

app.use("/", indexRouter);
app.use("/s", showcaseRouter);
app.use("/api", apiRouter);
app.use("/frb", frbRouter);

// redirect all requests to HTTPS
if (!process.env.WEB_HOST.includes("localhost")) {
  app.use(sslRedirect());
}

if (isProduction) {
  app.use(Sentry.Handlers.errorHandler());
}

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// error handler
app.use((err, req, res, next) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
