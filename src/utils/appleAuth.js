// src/utils/appleAuth.js
'use strict';

const appleSignin = require('apple-signin-auth');

// Sign in with Apple can be triggered from the native iOS button (bundle ID as
// audience) or, if ever added, a web/Android "Sign in with Apple" flow (a
// separate Services ID as audience) — mirrors googleAuth.js accepting multiple
// client/audience values for the same reason.
const AUDIENCES = [
  process.env.APPLE_BUNDLE_ID,     // com.glowbeauty.app — native iOS app
  process.env.APPLE_SERVICES_ID,   // Services ID, only if web/Android Apple sign-in is added later
].filter(Boolean);

/**
 * Verifies an Apple ID token and returns the identity fields we care about.
 * Throws if the token is invalid, expired, or issued for an audience we don't recognize.
 */
async function verifyAppleIdToken(idToken) {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: AUDIENCES,
    ignoreExpiration: false,
  });
  return {
    sub:   payload.sub,
    // Apple only sends `email` on the FIRST sign-in ever (private relay or
    // real address, user's choice) — every sign-in after that omits it, so
    // callers must not assume it's always present after the initial one.
    email: payload.email ? payload.email.toLowerCase().trim() : undefined,
  };
}

module.exports = { verifyAppleIdToken };
