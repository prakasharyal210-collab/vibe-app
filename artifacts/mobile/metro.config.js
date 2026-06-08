const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

const isMonorepo = fs.existsSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'));

if (isMonorepo) {
  config.watchFolders = [workspaceRoot];
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ];
  config.resolver.unstable_enableSymlinks = true;
} else {
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
  ];
}

config.resolver.unstable_enablePackageExports = true;

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
