const {
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BNB_SDK_VERSION = "1.18.+";
const BNB_PODSPECS_SOURCE =
  "https://github.com/sdk-banuba/banuba-sdk-podspecs.git";

// ── helpers ──────────────────────────────────────────────────────────────────

function copyDirSync(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── Android ───────────────────────────────────────────────────────────────────

function withBanubaAndroid(config) {
  // 1. Root build.gradle — add bnb_sdk_version ext property
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;

      // ── root build.gradle ────────────────────────────────────────────────
      const rootBuildPath = path.join(root, "build.gradle");
      if (fs.existsSync(rootBuildPath)) {
        let build = fs.readFileSync(rootBuildPath, "utf8");
        if (!build.includes("bnb_sdk_version")) {
          // Prepend ext block before buildscript
          build = build.replace(
            /^(\/\/ Top-level[^\n]*\n)/,
            `$1\n// Banuba SDK version used by face_tracker / background deps\next {\n    bnb_sdk_version = '${BNB_SDK_VERSION}'\n}\n`
          );
          // Fallback if the comment line isn't there
          if (!build.includes("bnb_sdk_version")) {
            build =
              `// Banuba SDK version\next {\n    bnb_sdk_version = '${BNB_SDK_VERSION}'\n}\n\n` +
              build;
          }
          fs.writeFileSync(rootBuildPath, build);
        }
      }

      // ── app/build.gradle — add deps + copyEffects task ───────────────────
      const appBuildPath = path.join(root, "app", "build.gradle");
      if (fs.existsSync(appBuildPath)) {
        let appBuild = fs.readFileSync(appBuildPath, "utf8");

        if (!appBuild.includes("com.banuba.sdk:face_tracker")) {
          appBuild = appBuild.replace(
            /(\bdependencies\s*\{)/,
            `$1\n    implementation "com.banuba.sdk:face_tracker:$project.bnb_sdk_version"\n    implementation "com.banuba.sdk:background:$project.bnb_sdk_version"`
          );
        }

        if (!appBuild.includes("copyBanubaEffects")) {
          appBuild +=
            `\n// Copy Banuba AR effects into Android assets at build time\n` +
            `task copyBanubaEffects(type: Copy) {\n` +
            `    from '../../assets/effects'\n` +
            `    into 'src/main/assets/bnb-resources/effects'\n` +
            `}\n` +
            `gradle.projectsEvaluated {\n` +
            `    preBuild.dependsOn(copyBanubaEffects)\n` +
            `}\n`;
        }

        fs.writeFileSync(appBuildPath, appBuild);
      }

      // ── copy effects into Android assets at prebuild time too ────────────
      const effectsSrc = path.join(projectRoot, "assets", "effects");
      const effectsDst = path.join(
        root,
        "app",
        "src",
        "main",
        "assets",
        "bnb-resources",
        "effects"
      );
      copyDirSync(effectsSrc, effectsDst);

      return cfg;
    },
  ]);

  return config;
}

// ── iOS ───────────────────────────────────────────────────────────────────────

function withBanubaIOS(config) {
  // 1. Info.plist — camera description (expo-camera/expo-av already add one,
  //    but belt-and-suspenders doesn't hurt)
  config = withInfoPlist(config, (cfg) => {
    if (!cfg.modResults.NSCameraUsageDescription) {
      cfg.modResults.NSCameraUsageDescription =
        "Gundruk uses the camera for AR effects and video posts.";
    }
    return cfg;
  });

  // 2. Podfile — add Banuba podspecs source + version + pods
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;
      const podfilePath = path.join(root, "Podfile");

      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, "utf8");

        // Remove any leftover DeepAR pod
        podfile = podfile.replace(/\s*pod 'DeepAR'\n?/g, "\n");

        // Add Banuba podspecs source after CocoaPods source (or at top of target)
        if (!podfile.includes(BNB_PODSPECS_SOURCE)) {
          // Insert sources before the first `target` block
          podfile = podfile.replace(
            /(platform\s*:ios[^\n]*\n)/,
            `$1\nsource 'https://github.com/CocoaPods/Specs.git'\nsource '${BNB_PODSPECS_SOURCE}'\n$bnb_sdk_version = '~> 1.18.0'\n`
          );
        }

        // Add Banuba pods inside the target block (before use_expo_modules!)
        if (!podfile.includes("BNBFaceTracker")) {
          podfile = podfile.replace(
            /(use_expo_modules!)/,
            `pod 'BNBFaceTracker', $bnb_sdk_version\n  pod 'BNBBackground', $bnb_sdk_version\n\n  $1`
          );
        }

        fs.writeFileSync(podfilePath, podfile);
      }

      // Copy effects into iOS assets at prebuild time
      const effectsSrc = path.join(projectRoot, "assets", "effects");
      const effectsDst = path.join(root, "effects");
      copyDirSync(effectsSrc, effectsDst);

      return cfg;
    },
  ]);

  return config;
}

// ── Entry point ───────────────────────────────────────────────────────────────

function withBanuba(config) {
  config = withBanubaAndroid(config);
  config = withBanubaIOS(config);
  return config;
}

module.exports = withBanuba;
