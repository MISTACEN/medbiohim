const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",
  entry: {
    background: "./src/background/serviceWorker.js",
    popup: "./src/js/popup.js",
    analyzer: "./src/content/analyzer.js",
    // MAIN-world network interceptor: must ship as its own content script so it
    // can wrap window.fetch/XHR before the platform's own scripts run.
    interceptor: "./src/content/interceptor.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "src/popup/popup.html", to: "popup.html" },
        { from: "src/content/styles.css", to: "styles.css" },
      ],
    }),
  ],
  optimization: { minimize: false },
  devtool: false,
};
