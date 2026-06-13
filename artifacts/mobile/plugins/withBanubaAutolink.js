/**
 * withBanubaAutolink
 *
 * Always included in plugins (regardless of BANUBA_ENABLED).
 * Manages @banuba/react-native in the expo.autolinking.exclude list
 * so that expo-modules-autolinking skips the native module at Gradle
 * configuration time when Banuba is disabled.
 *
 * Why package.json and not settings.gradle?
 *   expo-modules-autolinking reads expo.autolinking.exclude from package.json
 *   at Gradle time (after prebuild), so writing it here is picked up correctly.
 */

const { withDangerousMod } = require("expo/config-plugins");
const fs   = require("fs");
const path = require("path");

const MODULE = "@banuba/react-native";

function manageAutolinkExclusion(projectRoot, banubaEnabled) {
  const pkgPath = path.join(projectRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  if (!pkg.expo) pkg.expo = {};
  if (!pkg.expo.autolinking) pkg.expo.autolinking = {};
  if (!Array.isArray(pkg.expo.autolinking.exclude)) {
    pkg.expo.autolinking.exclude = [];
  }

  const excluded = pkg.expo.autolinking.exclude;
  const idx = excluded.indexOf(MODULE);

  if (!banubaEnabled && idx === -1) {
    // Add exclusion — module must not be linked
    excluded.push(MODULE);
    console.log(`[withBanubaAutolink] BANUBA_ENABLED=false → added ${MODULE} to autolinking exclusions`);
  } else if (banubaEnabled && idx !== -1) {
    // Remove exclusion — module should be linked normally
    excluded.splice(idx, 1);
    console.log(`[withBanubaAutolink] BANUBA_ENABLED=true → removed ${MODULE} from autolinking exclusions`);
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function withBanubaAutolink(config) {
  const banubaEnabled = process.env.BANUBA_ENABLED === "true";

  // Android — expo-modules-autolinking gradle plugin reads package.json at Gradle time
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      manageAutolinkExclusion(cfg.modRequest.projectRoot, banubaEnabled);
      return cfg;
    },
  ]);

  // iOS — use_expo_modules! in Podfile reads the same expo.autolinking.exclude field
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      manageAutolinkExclusion(cfg.modRequest.projectRoot, banubaEnabled);
      return cfg;
    },
  ]);

  return config;
}

module.exports = withBanubaAutolink;
