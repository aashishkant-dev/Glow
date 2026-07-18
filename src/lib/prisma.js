// src/lib/prisma.js
// Singleton Prisma client using the pg driver adapter (Prisma v7+).
// Import this file everywhere instead of requiring old Mongoose models.
'use strict';

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// Railway free tier: max 5 PostgreSQL connections.
// Production hobby plan: 10. Never exceed — Railway will hard-reject connections beyond limit.
// Dev hits the DB over a public TCP proxy (high per-query latency), so a pool of 3
// makes concurrent requests queue. Use 5 everywhere (Railway free-tier hard cap).
const POOL_MAX = parseInt(process.env.DB_POOL_MAX, 10) || 5;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  const adapter = new PrismaPg({
    connectionString,
    max: POOL_MAX,
    // Robustness: a hung query must never permanently hold a pool slot (pool starvation →
    // app-wide 500s). These bound every connection's lifetime.
    idleTimeoutMillis: 30_000,            // reclaim idle connections after 30s
    connectionTimeoutMillis: 10_000,      // fail fast if pool can't hand out a conn in 10s
    // Postgres-side guards (pg passes these through as session settings):
    statement_timeout: 15_000,            // kill any single query running > 15s
    query_timeout: 15_000,
    keepAlive: true,                      // detect dead TCP conns (Railway proxy drops idle)
  });

  const logLevels = process.env.NODE_ENV === 'production'
    ? ['error']
    : ['error', 'warn', 'query']; // 'query' logs slow queries in dev

  return new PrismaClient({
    adapter,
    log: logLevels,
  });
}

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  // Prevent hot-reload from creating multiple instances in dev
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
}

// Warm the pool at boot so the first real request doesn't pay connection cost.
prisma.$connect().catch(() => {});

module.exports = prisma;
