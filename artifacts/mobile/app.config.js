const appJson = require("./app.json");
const base = appJson.expo;

module.exports = {
  expo: {
    ...base,
    newArchEnabled: true,
    extra: {
      ...base.extra,
      banubaClientToken: process.env.BANUBA_CLIENT_TOKEN ?? "",
    },
    plugins: [
      ...base.plugins,
      ["expo-build-properties", {
        android: { minSdkVersion: 26 },
      }],
      "./plugins/withBanuba",
    ],
  },
};
