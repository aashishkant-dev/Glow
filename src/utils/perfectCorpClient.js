// src/utils/perfectCorpClient.js
'use strict';

// Real vision-model skin analysis via Perfect Corp's YouCam "AI Skin
// Diagnostic" API — replaces the interim heuristic engine (skinHeatmaps.js)
// as the primary source of truth for per-concern severity + masks. Follows
// the same "return null when not configured, throw on a real error" contract
// geminiSkinAnalysis.js already uses, so routes/skin.js's fallback logic
// looks the same shape for both vendors.
//
// Every request shape below (endpoint, field names, auth) is confirmed
// against a REAL sample request generated from this account's own API
// console/playground (the exact curl code Perfect Corp's own UI produces
// for AI Skin Analysis), not just scraped public docs — the two disagreed
// on two points and the console sample won:
// - Auth is a PLAIN static bearer token (`Authorization: Bearer <api_key>`)
//   — the RSA public key issued alongside this account's API key is NOT
//   used by this REST flow (it's for a different Perfect Corp product,
//   most likely their native camera-kit SDK licensing — confirmed by
//   trying the RSA client/auth flow live and getting a real, specific
//   401 rejection, then finding the console's own sample uses plain bearer).
// - The source photo is passed as `src_file_url` (a URL Perfect Corp's
//   servers fetch themselves) — no separate File Upload API / two-step
//   upload dance needed, since every scan photo is already uploaded to our
//   own public blob storage before this runs (see routes/skin.js).
//
// `parseTaskResponse` stays isolated and defensive (throws a SPECIFIC
// "response shape didn't match" error, not a generic crash) for the one
// piece that's still a best-effort reconstruction: the exact shape of a
// SUCCESSFUL analysis result (score/mask fields), since the console sample
// only showed the request, not a completed response body.

const BASE_URL = process.env.PERFECTCORP_BASE_URL || 'https://yce-api-01.makeupar.com';
const API_KEY = process.env.PERFECTCORP_API_KEY;

// SD-tier concern set — matches skinConcernContent.js's 7 keys exactly. SD
// and HD concern names cannot be mixed in one request per Perfect Corp's
// docs; this app requests SD only (HD requires larger source images and a
// higher-tier plan — worth revisiting once real usage/cost data comes in).
const DST_ACTIONS = ['pore', 'wrinkle', 'age_spot', 'texture', 'redness', 'moisture', 'acne'];

const TASK_CREATE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;
const MASK_DOWNLOAD_TIMEOUT_MS = 15_000;

class PerfectCorpError extends Error {
  constructor(message, code, { statusCode = null, retryable = false, internalReason = null } = {}) {
    super(message);
    this.name = 'PerfectCorpError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    // The raw vendor error code, if any — for server-side logs only. .message
    // is what gets relayed to the client on LOW_IMAGE_QUALITY, so it's kept
    // vendor-branding-free and code-free; this is where the real reason goes.
    this.internalReason = internalReason;
  }
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${API_KEY}`, ...extra };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new PerfectCorpError(`Request to ${url} timed out after ${timeoutMs}ms`, 'TIMEOUT', { retryable: true });
    }
    throw new PerfectCorpError(`Network error calling Perfect Corp: ${err.message}`, 'NETWORK_ERROR', { retryable: true });
  } finally {
    clearTimeout(timeout);
  }
}

// Vendor image-quality error codes (from docs.perfectcorp.com's documented
// failure behavior) — these mean THIS PHOTO is the problem (face too small,
// too dark, below minimum resolution, tilted too far — a real, live-tested
// list turned out longer than docs.perfectcorp.com's documented three
// (error_large_face_angle showed up in live testing and isn't in their
// published error-codes page), so this is used only for HTTP-level error
// bodies (classifyHttpError, a genuinely different response shape — see
// parseTaskResponse's own comment). A TASK-level error (`task_status:
// 'error'`, 200 response) is handled by pollTask below WITHOUT consulting
// this list at all: every task-level error has turned out to mean "this
// specific photo/task failed," never a transient service issue, so
// pollTask treats ALL of them as a retake-worthy rejection by default
// rather than risk silently downgrading an unlisted code to 'estimated'.
const IMAGE_QUALITY_ERROR_CODES = new Set([
  'error_src_face_too_small',
  'error_lighting_dark',
  'error_below_min_image_size',
  'error_large_face_angle',
]);

function classifyHttpError(status, bodyErrorCode) {
  if (bodyErrorCode && IMAGE_QUALITY_ERROR_CODES.has(bodyErrorCode)) {
    // No vendor human-readable string comes with an HTTP-level error body
    // (just the code) — unlike the task-level path below, there's nothing
    // to relay here, so this stays a clean, vendor-free message. .message
    // is what routes/skin.js relays straight to the mobile client on a
    // LOW_IMAGE_QUALITY rejection (see ImageQualityRejection) — it must
    // never carry the raw vendor code or the "Perfect Corp" name.
    return new PerfectCorpError('The photo didn\'t meet the quality requirements for analysis.', 'LOW_IMAGE_QUALITY', { statusCode: status, retryable: false, internalReason: bodyErrorCode });
  }
  if (status === 401 || status === 403) {
    return new PerfectCorpError(`Perfect Corp rejected the API key (${status})`, 'AUTH_FAILED', { statusCode: status, retryable: false });
  }
  if (status === 429) {
    return new PerfectCorpError('Perfect Corp rate limit exceeded', 'QUOTA_EXCEEDED', { statusCode: status, retryable: true });
  }
  if (status >= 500) {
    return new PerfectCorpError(`Perfect Corp server error (${status})`, 'SERVER_ERROR', { statusCode: status, retryable: true });
  }
  return new PerfectCorpError(`Perfect Corp request failed (${status}): ${bodyErrorCode || 'unknown'}`, 'UNKNOWN', { statusCode: status, retryable: false });
}

async function withRetry(fn, { retries = 2, baseDelayMs = 800 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!(err instanceof PerfectCorpError) || !err.retryable || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

// Confirmed against a REAL errored-task response (live test, 2026-08-30):
// { status: 200, data: { task_status: 'error', error: 'error_below_min_image_size',
// error_message: '...', results: null } } — note the error CODE lives at
// `data.error` (a string), not `data.error_code` as Perfect Corp's HTTP-level
// error responses use (see classifyHttpError, a genuinely different shape
// for a genuinely different failure class: transport/auth errors vs. a
// task that ran but couldn't complete). The SUCCESS shape (`results.output`
// with per-concern score/mask fields) is still a best-effort reconstruction
// from docs, not yet confirmed against a real completed analysis.
function parseTaskResponse(json) {
  const taskStatus = json?.data?.task_status;
  const output = json?.data?.results?.output;
  return { taskStatus, output, errorCode: json?.data?.error, errorMessage: json?.data?.error_message };
}

// src_file_url must be a URL Perfect Corp's own servers can fetch — the
// same public blob-storage URL already produced for photoUrl (see
// routes/skin.js), never a data: URI or anything requiring auth to fetch.
async function createTask(photoUrl) {
  const start = Date.now();
  const res = await fetchWithTimeout(
    `${BASE_URL}/s2s/v2.1/task/skin-analysis`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        src_file_url: photoUrl,
        dst_actions: DST_ACTIONS,
        miniserver_args: { enable_mask_overlay: false }, // separate per-concern mask files, not one image with masks burned in — we render our own overlay per tab
        format: 'json',
        pf_camera_kit: false,
      }),
    },
    TASK_CREATE_TIMEOUT_MS,
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw classifyHttpError(res.status, json?.error_code);
  const taskId = json?.data?.task_id;
  if (!taskId) throw new PerfectCorpError('Perfect Corp task-create response had no data.task_id', 'UNEXPECTED_RESPONSE_SHAPE', { retryable: false });
  return { taskId, durationMs: Date.now() - start };
}

// Task ID is a PATH segment on this endpoint (.../skin-analysis/{task_id}),
// confirmed from the console's own sample — not a query parameter.
async function pollTask(taskId) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await fetchWithTimeout(`${BASE_URL}/s2s/v2.1/task/skin-analysis/${taskId}`, { headers: authHeaders() }, 10_000);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw classifyHttpError(res.status, json?.error_code);
    const { taskStatus, output, errorCode, errorMessage } = parseTaskResponse(json);
    if (process.env.PERFECTCORP_DEBUG) console.error('[perfectCorpClient DEBUG] poll response:', JSON.stringify(json));
    if (taskStatus === 'success') return { output, durationMs: Date.now() - start };
    if (taskStatus === 'error') {
      // Every observed task-level error has been about THIS photo (too
      // small, too dark, too tilted, face too small) — treated uniformly
      // as a retake-worthy rejection rather than maintained as an
      // allowlist that live testing keeps finding gaps in (see
      // IMAGE_QUALITY_ERROR_CODES's own comment). errorMessage, when
      // present, is Perfect Corp's own human-readable string ("The face in
      // the input image is turned or tilted too far.") — relayed directly
      // since it's already clear, actionable, and vendor-agnostic prose (no
      // internal code or brand name in it). When it's absent, the fallback
      // must NOT be built from the raw errorCode/vendor name — that string
      // is what routes/skin.js relays verbatim to the mobile client on a
      // LOW_IMAGE_QUALITY rejection, and an internal code or "Perfect Corp"
      // has no business being user-facing text.
      throw new PerfectCorpError(errorMessage || 'The photo didn\'t meet the quality requirements for analysis.', 'LOW_IMAGE_QUALITY', { retryable: false, internalReason: errorCode });
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new PerfectCorpError('Perfect Corp analysis timed out waiting for task completion', 'TIMEOUT', { retryable: false });
}

async function downloadMask(url) {
  const res = await fetchWithTimeout(url, {}, MASK_DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) return null; // a missing mask image degrades to "no overlay for this concern," never fails the whole scan
  return Buffer.from(await res.arrayBuffer());
}

// raw_score: 0-100, HIGHER = healthier (per Perfect Corp's docs) — inverted
// here so it lines up with this app's existing severity convention (0-1,
// HIGHER = more severe/worse), the same scale the heuristic fallback and
// the gradient-bar UI already use.
function severityFromRawScore(rawScore) {
  const clamped = Math.max(0, Math.min(100, typeof rawScore === 'number' ? rawScore : 50));
  return Math.max(0, Math.min(1, 1 - clamped / 100));
}

// Public entry point. Returns null when PERFECTCORP_API_KEY isn't set (same
// "not configured" contract as analyzeWithGemini) — callers fall back to
// the heuristic without special-casing "is this even turned on." Throws a
// PerfectCorpError (with .code / .retryable) on any real failure; the
// caller (routes/skin.js) decides retry vs. fallback vs. reject-the-scan
// based on .code.
//
// Takes the ALREADY-UPLOADED photo's public URL (not a buffer) — this must
// run after routes/skin.js's own blob upload resolves, since Perfect Corp
// fetches the photo itself rather than accepting bytes directly.
//
// Deliberately returns ONLY raw vendor data (severity/score/mask bytes),
// not label/verdict/education/tips copy — routes/skin.js applies that
// uniformly via skinConcernContent.js's shared content, so the copy a user
// reads is byte-identical regardless of which engine (this, or the
// heuristic fallback) produced the underlying number.
//
// Returns { concerns: { [concernKey]: { maskBuffer, severity, rawScore,
// uiScore } | null }, usage: [{ endpoint, durationMs }] } — maskBuffer is
// the downloaded PNG bytes; routes/skin.js uploads it to our own blob
// storage (never hot-links Perfect Corp's own mask URLs, which are not
// guaranteed to stay valid past their documented file-retention window).
async function analyzeWithPerfectCorp(photoUrl) {
  if (!API_KEY) return null;

  const usage = [];
  const { taskId, durationMs: createMs } = await withRetry(() => createTask(photoUrl));
  usage.push({ endpoint: 'skin-analysis-create', durationMs: createMs });

  const { output, durationMs: pollMs } = await pollTask(taskId);
  usage.push({ endpoint: 'skin-analysis-poll', durationMs: pollMs });

  const byType = new Map((output || []).map((o) => [o.type, o]));
  const concerns = {};
  for (const key of DST_ACTIONS) {
    const entry = byType.get(key);
    if (!entry) { concerns[key] = null; continue; }

    const maskUrl = entry.mask_urls?.[0];
    const maskBuffer = maskUrl ? await downloadMask(maskUrl) : null;
    if (!maskBuffer) { concerns[key] = null; continue; }

    concerns[key] = {
      maskBuffer,
      severity: severityFromRawScore(entry.raw_score),
      rawScore: entry.raw_score,
      uiScore: entry.ui_score,
    };
  }

  return { concerns, usage };
}

module.exports = { analyzeWithPerfectCorp, PerfectCorpError, DST_ACTIONS };
