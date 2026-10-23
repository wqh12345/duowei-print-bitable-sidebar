const path = require("node:path");
const webpack = require("webpack");

const projectRoot = __dirname;
const isDevelopment = process.env.NODE_ENV !== "production";

const HtmlWebpackPlugin = require("html-webpack-plugin");
const { VueLoaderPlugin } = require("vue-loader");

module.exports = {
  context: projectRoot,
  mode: isDevelopment ? "development" : "production",
  entry: path.resolve(projectRoot, "src/main.ts"),
  devtool: isDevelopment ? "inline-source-map" : false,
  output: {
    path: path.resolve(projectRoot, "dist"),
    filename: "assets/[name].[contenthash:8].js",
    clean: true,
    // 托管/上架要求产物资源使用相对路径引用
    publicPath: isDevelopment ? "auto" : "./",
  },
  resolve: {
    extensions: [".ts", ".js", ".vue"],
  },
  module: {
    rules: [
      {
        test: /web-component-.*\.js$/,
        include: /node_modules[\\/]vue-print-designer[\\/]dist[\\/]/,
        loader: path.resolve(projectRoot, "scripts/designer-table-loader.cjs"),
      },
      {
        test: /\.vue$/,
        loader: "vue-loader",
        options: {
          compilerOptions: {
            isCustomElement: (tag) => tag === "print-designer",
          },
        },
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          configFile: path.resolve(projectRoot, "tsconfig.app.json"),
          transpileOnly: true,
          appendTsSuffixTo: [/\.vue$/],
          compilerOptions: { noEmit: false, allowImportingTsExtensions: false },
        },
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [
    new VueLoaderPlugin(),
    new webpack.DefinePlugin({
      __DUOWEI_TEMPLATE_SYNC_CONFIG__: JSON.stringify({
        authorizationEndpoint: "",
        registryEndpoint: "",
        bridgeEndpoint: "",
      }),
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(projectRoot, "index.html"),
      filename: "index.html",
    }),
  ],
  optimization: {
    splitChunks: { chunks: "all" },
  },
  devServer: isDevelopment ? {
    // 侧边栏插件本地调试：将 http://localhost:8080/ 粘贴到「自定义插件」预览地址
    port: 8080,
    hot: true,
    allowedHosts: "all",
    headers: { "Access-Control-Allow-Origin": "*" },
    client: {
      overlay: {
        // "ResizeObserver loop completed with undelivered notifications" 是浏览器
        // 在侧边栏宽度变化时的非致命告警（可能来自 vue-print-designer 内部观察器），
        // 不应触发全屏错误浮层遮挡插件页面。
        runtimeErrors: (error) =>
          !/ResizeObserver loop/i.test(error?.message || ""),
      },
    },
  } : undefined,
};
