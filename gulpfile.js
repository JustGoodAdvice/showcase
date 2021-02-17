const browserSync = require("browser-sync").create();
const cache = require("gulp-cached");
const del = require("del");
const eslint = require("gulp-eslint");
const findUp = require("find-up");
const {
  dest,
  parallel,
  series,
  src,
  watch
} = require("gulp");
const gNodemon = require("gulp-nodemon");
const node_modules = findUp.sync("node_modules");
const gSass = require("gulp-sass");
const sourcemaps = require("gulp-sourcemaps");
const webpack = require("webpack-stream");

// config
const port = process.env.PORT || 7000;
const paths = {
  server: [
    "app.js",
    "bin/**",
    "gulpfile.js",
    "middleware/**",
    "routes/**",
    "test/**/*.js"
  ],
  scripts: {
    dest: "public/dist/js/",
    src: "src/js/**/*.js"
  },
  scss: {
    dest: "public/dist/css",
    src: "src/sass/**/*.scss"
  },
  views: "views/**/*.ejs"
}

function cleandist() {
  return del("public/dist/**/*");
}

function lint() {
  // ESLint ignores files with "node_modules" paths.
  // So, it"s best to have gulp ignore the directory as well.
  // Also, Be sure to return the stream from the task;
  // Otherwise, the task may end before the stream has finished.
  return src(paths.server)
    .pipe(cache("linting"))
    // eslint() attaches the lint output to the "eslint" property
    // of the file object so it can be used by other modules.
    .pipe(eslint({
      configFile: ".eslintrc.json"
    }))
    // eslint.format() outputs the lint results to the console.
    // Alternatively use eslint.formatEach() (see Docs).
    .pipe(eslint.format());
}

function serve(cb) {
  // server's already started (in nodemon)
  // init browserSync with a proxy
  browserSync.init({
    proxy: {
      target: `localhost:${port}`
    },
    browser: "google chrome",
    port: port,
    ghostMode: {
      clicks: false // disable syncronized clicks
    },
    snippetOptions: { // inject script in <head> for turbolinks
      rule: {
        match: /<\/head>/i,
        fn: function(snippet, match) {
          return snippet + match;
        }
      }
    },
  });

  // watch SASS & JS to build and auto reload, views to auto reload
  watch(paths.scss.src, { debounceDelay: 2000 }, parallel(sass));
  watch(paths.scripts.src, { debounceDelay: 2000 }, parallel(scripts, lint));
  watch(paths.views).on("change", browserSync.reload);

  cb();
}

function nodemon(cb) {
  let started = false;
  const stream = gNodemon({
    script: "./bin/www",
    env: {
      NODE_ENV: "development",
      port: port
    },
    ext: ".js",
    ignore: [
      "gulpfile.js",
      "public/**",
      "test/**",
    ],
    legacyWatch: true,
    tasks: (changedFiles) => {
      if (!changedFiles) { return []; }
      // lintChanged(changedFiles);
      return [];
    },
    verbose: false
  });

  stream
    .on("start", () => {
      // avoid nodemon being started multiple times
      if (!started) {
        started = true;
        return cb();
      }
    })
    .on("crash", () => {
      console.error("Houston, we have a problem.");
      stream.emit("restart", 10) // restart server in 10 seconds
    })
}

// Compile sass into CSS & auto-inject into browsers
function sass() {
  const options = {
    outputStyle: "compressed",
    includePaths: [node_modules] // find node_modules above the cwd
  }
  return src([
    "src/sass/taffrail.scss",
    "src/sass/frb.scss",
  ])
    .pipe(sourcemaps.init())
    .pipe(gSass(options).on("error", gSass.logError))
    .pipe(sourcemaps.write("."))
    .pipe(dest(paths.scss.dest))
    .pipe(browserSync.stream({ match: "**/*.css" }));
}

function scripts() {
  return src([
    "src/js/main.js",
    "src/js/entryFrb.js"
  ])
    .pipe(webpack(require("./webpack.config.js")))
    .pipe(dest(paths.scripts.dest))
    .pipe(browserSync.stream());
}

exports.cleandist = cleandist;
exports.default = series(nodemon, parallel(scripts, sass), serve); // default
exports.lint = lint;
exports.postdeploy = series(cleandist, parallel(scripts, sass));
exports.sass = sass;
exports.scripts = scripts;
