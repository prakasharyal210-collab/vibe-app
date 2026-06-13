const appJson = require("./app.json");
const base = appJson.expo;

module.exports = {
  expo: {
    ...base,
    newArchEnabled: false,
    extra: {
      ...base.extra,
      deeparLicenseAndroid: process.env.DEEPAR_LICENSE_ANDROID ?? "",
      deeparLicenseIOS: process.env.DEEPAR_LICENSE_IOS ?? "",
    },
    plugins: [
      ...base.plugins,
      "./plugins/withDeepAR",
    ],
  },
};
