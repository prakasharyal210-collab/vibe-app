const appJson = require("./app.json");
const base = appJson.expo;

module.exports = {
  expo: {
    ...base,
    newArchEnabled: true,
    plugins: [
      ...base.plugins,
      ["expo-build-properties", {
        android: { minSdkVersion: 26 },
      }],
      ["expo-notifications", {
        icon: "./assets/images/notification-icon.png",
        color: "#7C3AED",
        defaultChannel: "default",
        sounds: [],
      }],
    ],
  },
};
