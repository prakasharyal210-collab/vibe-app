module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        // react-native 0.81.5, react-native-reanimated 4.x, and
        // react-native-worklets 0.5.x all ship JS files with private class
        // fields (#x, #y, #registry, #listenerCount, etc.) that the hermesc
        // version bundled with RN 0.81.5 cannot compile to bytecode.
        // Both plugins must share loose:true or Babel throws a consistency error.
        test: [
          /node_modules.*react-native[^-].*Libraries[\\/]Animated/,
          /node_modules.*react-native[^-].*Libraries[\\/]Debugging/,
          /node_modules.*react-native[^-].*Libraries[\\/]vendor[\\/]emitter/,
          /node_modules.*react-native[^-].*src[\\/]private/,
          /node_modules.*react-native-reanimated/,
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
