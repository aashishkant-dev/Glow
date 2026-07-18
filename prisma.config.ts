import { defineConfig } from 'prisma/config';

// TEST_DATABASE_URL: point CI at a separate test database so tests NEVER touch prod data.
// Set this in your CI environment (GitHub Actions secret) or local .env.test file.
// If not set, falls back to DATABASE_URL (acceptable for local dev, NOT for CI).
//
// NEVER set TEST_DATABASE_URL to the same value as the production DATABASE_URL.
const dbUrl =
  (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL)
    ? process.env.TEST_DATABASE_URL
    : (process.env.DATABASE_URL ?? 'postgresql://localhost:5432/glow');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: dbUrl,
  },
});
