module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    overrides: [
      {
        test: [
          /node_modules\/.pnpm\/react-native@.*\/node_modules\/react-native\/.*\.js$/,
          /node_modules\/.pnpm\/react-native-worklets@.*\.js$/,
          /node_modules\/.pnpm\/@tanstack\/.*\.js$/,
        ],
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
