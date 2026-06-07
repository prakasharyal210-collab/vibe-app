module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        // Many packages (react-native 0.81.5, react-native-worklets 0.5.x,
        // @tanstack/query-core 5.x, etc.) ship compiled .js files with
        // private class fields (#x, #focused, #provider…) that the hermesc
        // bundled with RN 0.81.5 cannot compile.
        //
        // Matching /\.js$/ (not /node_modules\/.*\.js$/) is intentional:
        // in pnpm workspace EAS builds the resolved file paths may go through
        // the virtual store and lose the literal "node_modules/" segment, so
        // a path-based test misses them. All our own source files are .tsx
        // so there is no collision with this broader pattern.
        //
        // TypeScript .ts/.tsx files are excluded by the extension filter —
        // the TypeScript transform (which must run first to strip "declare"
        // fields) is handled by babel-preset-expo on those extensions.
        //
        // Both plugins must share the same loose:true value or Babel throws.
        test: /\.js$/,
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
