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
  // pnpm uses a virtual store — disable hierarchical lookup so Metro only
  // resolves packages from the explicit nodeModulesPaths above and never
  // walks up the directory tree to find a wrong/duplicate version.
  disableHierarchicalLookup: true,
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
