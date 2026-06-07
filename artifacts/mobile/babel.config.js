module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        // react-native 0.81.5 ships many files with private class fields
        // (#x, #y, #registry, #listenerCount, etc.) that the hermesc version
        // bundled with RN 0.81.5 cannot compile. Transform them all to plain
        // property assignments before Hermes sees the bundle.
        // Both plugins must share the same loose:true value.
        test: [
          /node_modules.*react-native.*Libraries[\\/]Animated/,
          /node_modules.*react-native.*Libraries[\\/]Debugging/,
          /node_modules.*react-native.*Libraries[\\/]vendor[\\/]emitter/,
          /node_modules.*react-native.*src[\\/]private/,
          /node_modules.*react-native-worklets/,
        ],
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
