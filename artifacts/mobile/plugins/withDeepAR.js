const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DEEPAR_MAVEN = "https://sdk.developer.deepar.ai/maven-android-repository/releases/";

// react-native-deepar uses safeExtGet('Deepar_compileSdkVersion', 29) etc.
// Its default of 29 is too old for Java 9+ source (needs >= 30).
// We inject these ext properties into the root build.gradle so the library
// picks them up and compiles correctly.
const DEEPAR_EXT_BLOCK = `
// DeepAR SDK version overrides (react-native-deepar defaults to compileSdk 29
// which fails on Java 9+ source; override to match the app's target SDK).
ext {
    Deepar_compileSdkVersion = 35
    Deepar_buildToolsVersion = "35.0.0"
    Deepar_targetSdkVersion  = 35
    Deepar_minSdkVersion     = 24
}
`;

function addMavenRepo(contents) {
  if (contents.includes(DEEPAR_MAVEN)) return contents;

  if (contents.includes("allprojects")) {
    return contents.replace(
      /allprojects\s*\{[^}]*repositories\s*\{/s,
      (m) => m + `\n        maven { url "${DEEPAR_MAVEN}" }`
    );
  }

  return (
    contents +
    `\nallprojects {\n  repositories {\n    maven { url "${DEEPAR_MAVEN}" }\n  }\n}\n`
  );
}

function addDeepARExtBlock(contents) {
  if (contents.includes("Deepar_compileSdkVersion")) return contents;
  // Prepend before the first top-level block so ext is available to all subprojects
  return DEEPAR_EXT_BLOCK + contents;
}

function withDeepARAndroid(config) {
  config = withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      const libs = application["uses-native-library"] ?? [];
      const has = libs.some((l) => l.$?.["android:name"] === "libOpenCL.so");
      if (!has) {
        application["uses-native-library"] = [
          ...libs,
          { $: { "android:name": "libOpenCL.so", "android:required": "false" } },
        ];
      }
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;

      // Only modify build.gradle — adding allprojects{} to settings.gradle
      // causes "Projects for build ':' have not been registered yet" in Gradle 8+
      const buildPath = path.join(root, "build.gradle");
      if (fs.existsSync(buildPath)) {
        let build = fs.readFileSync(buildPath, "utf8");
        let changed = false;

        // 1. Add DeepAR maven repository
        if (!build.includes(DEEPAR_MAVEN)) {
          build = addMavenRepo(build);
          changed = true;
        }

        // 2. Add ext block so react-native-deepar picks up the correct SDK versions
        if (!build.includes("Deepar_compileSdkVersion")) {
          build = addDeepARExtBlock(build);
          changed = true;
        }

        if (changed) {
          fs.writeFileSync(buildPath, build);
        }
      }

      const effectsSrc = path.join(cfg.modRequest.projectRoot, "assets", "effects");
      const effectsDst = path.join(root, "app", "src", "main", "assets", "effects");
      if (fs.existsSync(effectsSrc)) {
        fs.mkdirSync(effectsDst, { recursive: true });
        for (const file of fs.readdirSync(effectsSrc)) {
          if (file.endsWith(".deepar")) {
            fs.copyFileSync(path.join(effectsSrc, file), path.join(effectsDst, file));
          }
        }
      }
      return cfg;
    },
  ]);

  return config;
}

function withDeepARIOS(config) {
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const podfilePath = path.join(root, "Podfile");

      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, "utf8");
        if (!podfile.includes("pod 'DeepAR'")) {
          podfile = podfile.replace(
            /\n(\s+)(use_expo_modules!)/,
            (_, indent, line) => `\n${indent}pod 'DeepAR'\n${indent}${line}`
          );
          fs.writeFileSync(podfilePath, podfile);
        }
      }

      const effectsSrc = path.join(cfg.modRequest.projectRoot, "assets", "effects");
      const projectName = cfg.modRequest.projectName ?? "gundruk";
      const effectsDst = path.join(root, projectName, "effects");
      if (fs.existsSync(effectsSrc)) {
        fs.mkdirSync(effectsDst, { recursive: true });
        for (const file of fs.readdirSync(effectsSrc)) {
          if (file.endsWith(".deepar")) {
            fs.copyFileSync(path.join(effectsSrc, file), path.join(effectsDst, file));
          }
        }
      }
      return cfg;
    },
  ]);

  return config;
}

function withDeepAR(config) {
  config = withDeepARAndroid(config);
  config = withDeepARIOS(config);
  return config;
}

module.exports = withDeepAR;
