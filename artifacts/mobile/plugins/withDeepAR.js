const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DEEPAR_MAVEN = "https://sdk.developer.deepar.ai/maven-android-repository/releases/";

function addMavenRepo(contents) {
  if (contents.includes(DEEPAR_MAVEN)) return contents;

  if (contents.includes("dependencyResolutionManagement")) {
    return contents.replace(
      /dependencyResolutionManagement\s*\{([^}]*repositories\s*\{)/s,
      (match, inner) =>
        match.replace(inner, inner + `\n        maven { url "${DEEPAR_MAVEN}" }`)
    );
  }

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
        if (!build.includes(DEEPAR_MAVEN)) {
          build = addMavenRepo(build);
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
