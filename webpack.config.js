const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  optimization: {
    minimizer: [
      new TerserPlugin({ cache: true, parallel: true, sourceMap: false })
    ]
  },
  entry: {
    main: "./src/js/main.js",
    frb: "./src/js/entryFrb.js",
    frbwide: "./src/js/entryFrbWide.js"
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "./public/dist/js/")
  },
  stats: {
    colors: !/^win/i.test(process.platform)
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        // add any modules here that need transpilation
        // debug, async-es are 2 that require it so far!!!
        // https://github.com/webpack/webpack/issues/2031#issuecomment-219040479
        exclude: /node_modules\/(?!(debug|async-es)\/).*/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [["@babel/preset-env", { "shippedProposals": true }]]
          }
        }
      }
    ]
  }
}
