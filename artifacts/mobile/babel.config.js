module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    overrides: [
      {
        test: /react-native[\\/]src[\\/]private/,
        presets: [
          ['@babel/preset-flow'],
        ],
        plugins: [
          ['@babel/plugin-transform-classes', { loose: true }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
        ],
      },
    ],
  };
};
