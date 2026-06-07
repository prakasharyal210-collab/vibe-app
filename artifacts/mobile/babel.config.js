module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        // react-native 0.81.5 ships DOMRectReadOnly.js (and siblings) with
        // private class fields (#x, #y, #width, #height) that the hermesc
        // version bundled with RN 0.81.5 cannot compile. Transform them to
        // plain property assignments before Hermes sees the bundle.
        // "loose: true" must match on both plugins or Babel throws a
        // consistency error.
        test: /node_modules.*react-native[\\/]src[\\/]private[\\/]webapis/,
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
