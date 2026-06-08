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
        // hermesc (shipped with RN 0.81.x) cannot compile private class
        // fields (#field syntax). Many npm packages ship compiled JS with
        // them: react-native core, worklets, reanimated, tanstack/query,
        // screens, and more.
        //
        // WHY /\.js$/ and not /node_modules/:
        // pnpm in EAS resolves packages through its virtual store. When
        // Metro follows symlinks, the resolved absolute paths may or may
        // not contain the literal string "node_modules". Using /\.js$/
        // with no path requirement is the only pattern that reliably
        // catches every compiled JS file regardless of path.
        //
        // Our own source is .ts/.tsx so it never matches /\.js$/.
        // All three plugins MUST share the same loose:true value.
        test: /\.js$/,
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
        ],
      },
    ],
  };
};
