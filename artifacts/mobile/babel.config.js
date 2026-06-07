module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      // Transform class properties in "loose" mode — uses simple assignment
      // instead of Object.defineProperty, which is what Hermes requires when
      // it encounters private class fields (#x, #y, etc.) from dependencies.
      ["@babel/plugin-transform-class-properties", { loose: true }],
      // Transform private methods (#method()) — must also be loose to match.
      ["@babel/plugin-transform-private-methods", { loose: true }],
    ],
  };
};
