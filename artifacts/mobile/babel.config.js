module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        test: /node_modules/,
        presets: [
          [
            "babel-preset-expo",
            {
              unstable_transformProfile: "hermes-stable",
            },
          ],
        ],
        plugins: [
          ["@babel/plugin-transform-class-properties", { loose: true }],
          ["@babel/plugin-transform-private-methods", { loose: true }],
        ],
      },
    ],
  };
};
