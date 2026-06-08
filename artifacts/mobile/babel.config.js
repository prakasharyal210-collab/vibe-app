module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    overrides: [
      {
        test: /node_modules[\\/]react-native[\\/]src[\\/]/,
        plugins: [
          require('@babel/plugin-transform-flow-strip-types'),
          ['@babel/plugin-transform-classes', { loose: true }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
          ['@babel/plugin-transform-private-fields', { loose: true }],
        ],
      },
    ],
  };
};
