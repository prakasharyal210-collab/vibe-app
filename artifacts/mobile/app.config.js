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
      "./plugins/withBanuba",
    ],
  },
};
