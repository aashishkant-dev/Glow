// Test environment bootstrap — runs before any test module loads.
// Sets required env vars so jwt.js and other startup guards don't throw.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/glow_test';
process.env.NODE_ENV = 'test';
