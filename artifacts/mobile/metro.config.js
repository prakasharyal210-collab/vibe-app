const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ],
  // Required for symlinked packages in the pnpm virtual store.
  unstable_enableSymlinks: true,
  // Required for packages that use the "exports" field in package.json
  // (e.g. @tanstack/react-query, expo-router internals).
  unstable_enablePackageExports: true,
};

config.transformer = {
  ...config.transformer,
  // Required for expo-router's require.context usage.
  unstable_allowRequireContext: true,
};

module.exports = config;
