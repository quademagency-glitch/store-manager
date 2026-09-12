// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withSentryConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList || []),
  /(^|\/)\._.*/,
];

module.exports = withSentryConfig(config);
