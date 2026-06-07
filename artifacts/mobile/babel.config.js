module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        // Many packages (react-native 0.81.5, react-native-reanimated 4.x,
        // react-native-worklets 0.5.x, @tanstack/query-core 5.x, etc.) ship
        // compiled JS with private class fields (#x, #focused, #provider…)
        // that the hermesc bundled with RN 0.81.5 cannot compile.
        //
        // We target only .js files: packages that ship raw .ts/.tsx source
        // (e.g. expo-file-system/src/) need the TypeScript transform to run
        // FIRST to strip "declare" fields — applying class-properties before
        // that causes "TypeScript 'declare' fields must first be transformed"
        // errors. Compiled .js files have no declare/TypeScript syntax, so
        // they are safe to transform in any order.
        //
        // Both plugins must use the same loose:true value or Babel throws.
        test: /node_modules\/.*\.js$/,
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
