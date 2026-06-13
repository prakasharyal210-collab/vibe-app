const appJson = require("./app.json");
const base = appJson.expo;

// Set BANUBA_ENABLED=true to include Banuba native AR SDK in the build.
// Defaults to false so a plain `expo prebuild` produces a clean APK.
const banubaEnabled = process.env.BANUBA_ENABLED === "true";

module.exports = {
  expo: {
    ...base,
    newArchEnabled: true,
    extra: {
      ...base.extra,
      // Expose the flag to runtime code via Constants.expoConfig.extra.banubaEnabled
      banubaEnabled,
      banubaClientToken: banubaEnabled ? (process.env.BANUBA_CLIENT_TOKEN ?? "") : "",
    },
    plugins: [
      ...base.plugins,
      ["expo-build-properties", {
        android: { minSdkVersion: 26 },
      }],
      // Always runs — adds/removes @banuba/react-native from expo.autolinking.exclude
      // so expo-modules-autolinking skips the native Gradle subproject when disabled.
      "./plugins/withBanubaAutolink",
      // withBanuba is only included when BANUBA_ENABLED=true.
      // When omitted, expo prebuild produces no Banuba Maven deps or native .so files.
      ...(banubaEnabled ? ["./plugins/withBanuba"] : []),
    ],
  },
};
