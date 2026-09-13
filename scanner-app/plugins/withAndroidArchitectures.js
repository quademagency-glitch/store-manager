const { withGradleProperties } = require('expo/config-plugins');

/**
 * Build Android native code for ARM only.
 *
 * WHY A PLUGIN AND NOT android/gradle.properties: `/android` is gitignored in
 * this project, so EAS never receives it and regenerates the whole folder with
 * `expo prebuild` on every build. An edit to gradle.properties therefore works
 * locally, survives nothing, and is silently discarded in CI, which is exactly
 * what happened on 2026-09-13 before this file existed. Anything that has to
 * hold has to come from app.json.
 *
 * WHY ARM ONLY: x86 and x86_64 are emulator architectures. No handset a shop
 * will use runs them, and every native library in the app, React Native,
 * Hermes, Reanimated, Screens, ships its own .so per architecture. Building all
 * four produced a 145MB APK, which is a real barrier for someone installing it
 * on a prepaid data bundle.
 *
 * armeabi-v7a is kept deliberately alongside arm64-v8a. It is 32-bit ARM, and
 * the cheaper and older handsets common on a shop floor still need it.
 * Dropping it would shrink the download further while silently excluding
 * exactly the staff most likely to be handed a scanner.
 */
const ARCHITECTURES = 'armeabi-v7a,arm64-v8a';

module.exports = function withAndroidArchitectures(config) {
  return withGradleProperties(config, (cfg) => {
    const properties = cfg.modResults;
    const existing = properties.find(
      (p) => p.type === 'property' && p.key === 'reactNativeArchitectures',
    );

    if (existing) {
      existing.value = ARCHITECTURES;
    } else {
      properties.push({
        type: 'property',
        key: 'reactNativeArchitectures',
        value: ARCHITECTURES,
      });
    }

    return cfg;
  });
};
