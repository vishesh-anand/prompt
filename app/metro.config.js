// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro's cache doesn't know about environment variables, so a file compiled for a normal build could be reused in the
// scripted-test build (switching its test-only code off) or the other way round. A separate cache per setting prevents that.
config.cacheVersion = `${config.cacheVersion}-e2e${process.env.EXPO_PUBLIC_E2E === '1' ? 'on' : 'off'}`;

module.exports = config;
