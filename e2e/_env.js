// e2e/_env.js — shared credential loading for the verification scripts.
//
// These scripts used to hardcode the real JWT signing secret and the local
// database URL as string literals. That is how the live secret ended up
// committed to a public repository: the pattern was copied from script to
// script, and each new script carried the secret with it.
//
// Everything now comes from the environment (loaded from the repo-root .env,
// which IS gitignored), and every getter throws when its value is missing
// rather than falling back to a default. A loud failure is the point: a
// silent fallback is what lets a wrong secret produce confusing 401s, and a
// hardcoded one is what leaks.
'use strict';

const path = require('path');

// Load the repo-root .env regardless of the directory a script is run from.
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function required(name, hint) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[e2e] ${name} is not set.\n` +
      `      These scripts read it from the repo-root .env — they no longer\n` +
      `      contain any credential inline.\n` +
      `      ${hint}`
    );
  }
  return value;
}

/** The signing secret the local API verifies tokens with. Never hardcode it. */
function jwtSecret() {
  return required('JWT_SECRET', 'Add JWT_SECRET=... to .env, matching the API you are testing against.');
}

/**
 * Database URL for scripts that talk to Postgres directly. Returned rather
 * than assigned, so a caller that wants it on process.env for Prisma does
 * that explicitly and visibly.
 */
function databaseUrl() {
  return required('DATABASE_URL', 'Add DATABASE_URL=postgresql://... to .env (the local dev database).');
}

/** Sets DATABASE_URL for Prisma, which reads it off process.env at import. */
function useDatabase() {
  process.env.DATABASE_URL = databaseUrl();
  return process.env.DATABASE_URL;
}

/** Base URL of the API under test. Defaults to local dev — not a secret. */
function apiBase() {
  return process.env.E2E_API_BASE || 'http://localhost:3000';
}

module.exports = { jwtSecret, databaseUrl, useDatabase, apiBase, required };
