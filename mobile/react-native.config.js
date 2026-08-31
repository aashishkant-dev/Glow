// Did not exist before this project's live-MediaPipe scope (Part 2) —
// modules/skin-segmentation (Part 3) is a genuine Expo Module, discovered
// automatically by Expo's own ./modules/ autolinking convention
// (expo-module.config.json is what that mechanism actually keys off).
// modules/mediapipe-face-landmarker is a plain Nitro/React-Native native
// module (no ExpoModulesCore dependency, no expo-module.config.json) —
// whether Expo's autolinking would ALSO have picked up a bare podspec
// sitting under ./modules/ with no expo-module.config.json is genuinely
// uncertain (see this project's own scope report), so this declares it
// explicitly via the standard, unambiguous React Native community-CLI
// mechanism instead of relying on that implicit behavior.
module.exports = {
  dependencies: {
    'nitro-glow-face-landmarker': {
      root: './modules/mediapipe-face-landmarker',
    },
  },
};
