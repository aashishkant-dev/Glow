// src/utils/cache.js
// In-process LRU fallback + ioredis Upstash Redis (TLS).
// Redis is best-effort: every cache call gracefully degrades to in-process LRU
// so the app is never blocked by Redis availability.
// Set REDIS_URL=rediss://default:<token>@<host>:6379 on Render.

// ── In-process LRU (always available, survives Redis outages) ────────────────
// Keyed by cache key, value is { data, expiresAt }. Max 500 entries, evict oldest.
const LRU_MAX = 500;
const lruMap  = new Map();

function lruGet(key) {
  const entry = lruMap.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { lruMap.delete(key); return null; }
  return entry.data;
}

function lruSet(key, data, ttlSeconds) {
  if (lruMap.size >= LRU_MAX) {
    // evict oldest inserted key
    lruMap.delete(lruMap.keys().next().value);
  }
  lruMap.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function lruDel(key) { lruMap.delete(key); }

function lruDelPattern(pattern) {
  // Convert glob pattern (e.g. 'provider:jobs:my:abc*') to regex
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  for (const k of lruMap.keys()) { if (re.test(k)) lruMap.delete(k); }
}

// ── Redis (optional, distributed cache shared across Render instances) ────────
let redisClient = null;
let redisReady  = false;
let retryTimer  = null;
const RETRY_MS  = 30_000;

async function initRedis() {
  // Read URL at call time — safe whether dotenv loaded before or after module
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('⚠️  REDIS_URL not set — using in-process LRU only');
    return;
  }
  try {
    const Redis = require('ioredis');
    const c = new Redis(url, {
      lazyConnect:          true,
      enableOfflineQueue:   false,
      connectTimeout:       5000,
      commandTimeout:       3000,
      maxRetriesPerRequest: 0,   // fail fast; LRU handles fallback
      tls:                  url.startsWith('rediss://') ? {} : undefined,
      retryStrategy:        () => null, // no auto-reconnect; we manage it
    });

    // Attach handlers BEFORE connect() so no events are missed
    c.on('ready',   () => { redisReady = true;  console.log('✔ Redis connected'); });
    c.on('error',   () => { redisReady = false; });
    c.on('close',   () => { redisReady = false; scheduleRetry(); });
    c.on('end',     () => { redisReady = false; scheduleRetry(); });

    await c.connect();
    redisClient = c;
    redisReady  = true;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  } catch (err) {
    console.warn('⚠️  Redis unavailable — LRU fallback active:', err.message);
    redisClient = null;
    redisReady  = false;
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = null; initRedis().catch(() => {}); }, RETRY_MS);
}

// ── Public API ────────────────────────────────────────────────────────────────
// DISABLE_CACHE=1 (env): bypass all app caching — every request hits the DB
// fresh. Dev/iteration mode only; unset once the product stabilizes.
const CACHE_DISABLED = process.env.DISABLE_CACHE === '1' || process.env.DISABLE_CACHE === 'true';
if (CACHE_DISABLED) console.warn('⚠️  DISABLE_CACHE set — app-level caching is OFF');

async function cacheGet(key) {
  if (CACHE_DISABLED) return null;
  // Try Redis first; fall through to LRU on any failure
  if (redisReady && redisClient) {
    try {
      const raw = await redisClient.get(key);
      if (raw !== null) return JSON.parse(raw);
    } catch { redisReady = false; }
  }
  return lruGet(key);
}

async function cacheSet(key, value, ttlSeconds = 60) {
  if (CACHE_DISABLED) return;
  lruSet(key, value, ttlSeconds); // always write LRU
  if (redisReady && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch { redisReady = false; }
  }
}

async function cacheDel(key) {
  lruDel(key);
  if (redisReady && redisClient) {
    try { await redisClient.del(key); } catch { redisReady = false; }
  }
}

async function cacheFlushPattern(pattern) {
  lruDelPattern(pattern);
  if (redisReady && redisClient) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) await redisClient.del(...keys);
    } catch { redisReady = false; }
  }
}

// Defer init so dotenv always loads first (routes require this file after dotenv.config())
setImmediate(() => initRedis().catch(() => {}));

module.exports = { cacheGet, cacheSet, cacheDel, cacheFlushPattern, getClient: () => redisClient };