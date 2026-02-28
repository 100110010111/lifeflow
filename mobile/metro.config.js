const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  fs: require.resolve('./src/empty-module.js'),
  stream: require.resolve('./src/empty-module.js'),
};

module.exports = config;
