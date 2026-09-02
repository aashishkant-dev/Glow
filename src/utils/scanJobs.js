// src/utils/scanJobs.js
// Ephemeral status store for POST /skin/scan's async/polling path (see
// routes/skin.js's runScanPipeline + GET /scan/jobs/:jobId/status) — reuses
// this app's existing cache.js exactly as-is (Redis when configured, an
// in-process LRU fallback otherwise, same "best-effort, never blocks the
// app" contract every other cached value in this codebase already accepts).
// That matters here specifically because cache.js's own comment already
// establishes this app expects to run across more than one instance
// ("distributed cache shared across ... instances") — a bespoke in-memory-
// only Map would silently break status polling the moment that happens (a
// poll landing on a different instance than the one running the job), so
// this reuses the one mechanism in the codebase already built to survive
// that, rather than inventing a second, narrower one.
'use strict';

const { cacheGet, cacheSet } = require('./cache');

// 10 minutes: comfortably longer than any real scan (Gemini's own ceiling is
// 25s; production has been observed up to ~36-60s under load — see
// routes/skin.js's own comment on that), short enough that an abandoned job
// (app killed mid-scan, network dropped before the client ever polled) does
// not linger indefinitely. The LRU fallback also hard-caps at 500 entries
// with oldest-first eviction, so this is bounded even without Redis.
const JOB_TTL_SECONDS = 600;

const keyOf = (jobId) => `skin:scanjob:${jobId}`;

// Every write carries the full job shape (no read-modify-write) — each job's
// own pipeline run is the only writer to its key, called sequentially, so
// there's no concurrent-writer race to guard against, and writing a full
// snapshot every time means a truncated/partial update is never possible.
async function setJob(jobId, userId, data) {
  await cacheSet(keyOf(jobId), { userId, ...data }, JOB_TTL_SECONDS);
}

async function getJob(jobId) {
  return cacheGet(keyOf(jobId));
}

module.exports = { setJob, getJob };
