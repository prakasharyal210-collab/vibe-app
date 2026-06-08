module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Required for expo-router's import.meta usage.
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
