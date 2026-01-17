const path = require("path");
const fs = require("fs"); // <--- Added fs import
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const isEnvProduction = process.env.NODE_ENV === "production";

module.exports = {
    mode: isEnvProduction ? "production" : "development",
    devtool: "source-map",
    entry: {
        index: "./src/ui/index.jsx",
        code: "./src/sandbox/code.js"
    },
    experiments: {
        outputModule: true
    },
    output: {
        pathinfo: !isEnvProduction,
        path: path.resolve(__dirname, "dist"),
        module: true,
        filename: "[name].js"
    },
    externalsType: "module",
    externalsPresets: { web: true },
    externals: {
        "add-on-sdk-document-sandbox": "add-on-sdk-document-sandbox",
        "express-document-sdk": "express-document-sdk"
    },
    // --- START OF NEW CONFIGURATION ---
    devServer: {
        // This tells Webpack to use your custom certs
        server: {
            type: 'https',
            options: {
                key: fs.readFileSync(path.resolve(__dirname, 'localhost-key.pem')),
                cert: fs.readFileSync(path.resolve(__dirname, 'localhost.pem')),
            },
        },
        // Adobe Add-ons usually run on specific ports (e.g. 5241 or 8080).
        port: 5241,
        hot: true,
        allowedHosts: "all",
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"
        }
    },
    // --- END OF NEW CONFIGURATION ---
    plugins: [
        new HtmlWebpackPlugin({
            template: "src/index.html",
            scriptLoading: "module",
            excludeChunks: ["code"]
        }),
        new CopyWebpackPlugin({
            patterns: [{ from: "src/*.json", to: "[name][ext]" }]
        })
    ],
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                use: ["babel-loader"],
                exclude: /node_modules/
            },
            {
                test: /(\.css)$/,
                use: ["style-loader", "css-loader"]
            }
        ]
    },
    resolve: {
        extensions: [".jsx", ".js", ".css"]
    }
};