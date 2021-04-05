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
    frb: "./src/js/entryFrb.js"
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
        exclude: /node_modules/,
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
