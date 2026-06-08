module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
        },
      ],
    ],
    overrides: [
      {
        // hermesc (RN 0.81.x) cannot compile private class field syntax
        // (#field). Many packages ship compiled .js with private fields:
        // react-native core, worklets, reanimated, tanstack/query, screens…
        //
        // WHY test: /\.js$/ with no path prefix:
        // pnpm resolves packages through its virtual store. In EAS builds the
        // absolute paths DO contain node_modules, but Metro may also follow
        // symlinks where the resolved path lacks it. /\.js$/ catches every
        // compiled JS file regardless of path.
        //
        // WHY all four plugins must share loose:true:
        // Babel 7.21+ enforces that @babel/plugin-transform-class-properties,
        // @babel/plugin-transform-private-fields,
        // @babel/plugin-transform-private-methods, and
        // @babel/plugin-transform-private-property-in-object all use the
        // SAME loose value. Mixing loose:true with loose:false throws.
        // Additionally, class-properties in 7.21+ internally delegates
        // private field handling to the private-fields plugin — so that
        // plugin must be installed and listed here.
        test: /\.js$/,
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-fields', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
        ],
      },
    ],
  };
};
