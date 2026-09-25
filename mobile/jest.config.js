// Scoped deliberately to the PURE modules - the ones that import nothing from
// Expo or React Native.
//
// This is a plain node runner with no babel step, so it can only load CommonJS
// that needs no transform. That is the whole reason src/lib/pushDecision.js
// uses module.exports while the rest of the app uses ESM: it keeps the one part
// of push that can be reasoned about without a device inside reach of a test.
//
// Rendering tests, or anything touching expo-secure-store / expo-notifications,
// would need jest-expo plus a native mock surface. That is a bigger commitment
// than this feature justified, so those paths are verified on a real device
// instead - see the Task 9 sequence in
// docs/superpowers/plans/2026-09-25-mobile-push-notifications.md.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/__tests__/**/*.test.js'],
};
