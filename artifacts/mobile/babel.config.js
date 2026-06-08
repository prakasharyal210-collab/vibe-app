module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // Required for expo-router's import.meta usage.
          unstable_transformImportMeta: true,
        },
      ],
    ],
    overrides: [
      {
        // hermesc (bundled with RN 0.81.5) cannot compile private class
        // fields (#field syntax). Many packages ship them in compiled JS:
        // react-native core, react-native-worklets, react-native-reanimated,
        // @tanstack/query-core, react-native-screens, and more.
        //
        // test: /\.js$/ (no path prefix) is intentional — pnpm resolves
        // symlinks to the virtual store and the resulting absolute paths
        // may not contain the literal "node_modules/" segment, so any
        // path-based pattern silently misses those files.
        //
        // Our own source files are .ts/.tsx so they never match /\.js$/.
        // TypeScript "declare" fields only appear in .ts/.tsx files and
        // are therefore safely excluded by this extension filter.
        //
        // All three plugins must use the same loose:true value.
        test: /\.js$/,
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
          [
            "@babel/plugin-transform-private-property-in-object",
            { loose: true },
          ],
        ],
      },
    ],
  };
};
