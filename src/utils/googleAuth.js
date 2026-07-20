// src/utils/googleAuth.js
'use strict';

const { OAuth2Client } = require('google-auth-library');

// Accept tokens issued for any of our three OAuth clients (iOS, Android, Web) —
// Google issues a distinct client ID per platform but the same verifier checks
// all of them via the `audience` array.
const CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
  process.env.GOOGLE_CLIENT_ID_WEB,
].filter(Boolean);

const client = new OAuth2Client();

/**
 * Verifies a Google ID token and returns the identity fields we care about.
 * Throws if the token is invalid, expired, or issued for a client ID we don't recognize.
 */
async function verifyGoogleIdToken(idToken) {
  const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_IDS });
  const payload = ticket.getPayload();
  return {
    sub:     payload.sub,
    // Normalize like every other email-based auth path in this codebase
    // (register-email/login-email/forgot-password all run .normalizeEmail()).
    // Google emails are almost always already lowercase, but this keeps
    // account matching/creation consistent if that ever isn't the case.
    email:   payload.email ? payload.email.toLowerCase().trim() : payload.email,
    name:    payload.name,
    picture: payload.picture,
  };
}

module.exports = { verifyGoogleIdToken };
