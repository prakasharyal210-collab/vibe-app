module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        // Many packages (react-native 0.81.5, react-native-reanimated 4.x,
        // react-native-worklets 0.5.x, @tanstack/query-core 5.x, etc.) ship
        // JS with private class fields (#x, #focused, #provider, etc.) that
        // the hermesc bundled with RN 0.81.5 cannot compile.
        //
        // Applying ONLY these two plugins (no preset) via overrides is safe:
        // they transform #field syntax to plain assignments and never touch
        // JSX, TypeScript, or any other transform babel-preset-expo owns.
        // Both must use the same loose:true value or Babel throws.
        test: /node_modules/,
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
