module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        test: [
          /node_modules.*react-native.*Libraries[\\/]Debugging[\\/]DebuggingOverlayRegistry/,
          /node_modules.*react-native.*Libraries[\\/]vendor[\\/]emitter[\\/]EventEmitter/,
          /node_modules.*react-native.*src[\\/]private[\\/]webapis/,
        ],
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
