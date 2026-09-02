// src/utils/ivyAiClient.js
// Stage 7 — Ivy AI ScanSkinAI Facial Analysis client.
//
// Validated against the live API before this was written (see
// e2e/verify_ivyai_part_a.js and its sweep mode). Real measured behaviour
// that shaped this file, none of it assumed:
//   • Latency is 21.7–25.1s wall (median 23.7s) across 9 real calls — their
//     docs claim "5–20s", which is simply wrong. Every single call exceeded
//     the documented ceiling, so the timeout here is sized off the measured
//     spread, not the docs.
//   • Latency does NOT correlate with payload size (107KB→23.8s vs
//     293KB→25.0s), so there is nothing to gain by shrinking the image
//     further than the pipeline already does.
//   • The live response's metric KEYS differ from the documented ones: the
//     docs promise poreVisibility/eyeBags/evenness; the API actually returns
//     pores/radiance/aging. METRIC_TO_CONCERN below maps the REAL keys.
//   • It genuinely refuses unusable photos (400 + specific reasons) rather
//     than guessing — matching this app's own "not assessed beats a wrong
//     answer" stance, so a refusal is treated as "no vendor data", not an
//     error worth failing the scan over.
'use strict';

const BASE_URL = process.env.IVYAI_BASE_URL || 'https://facial-scan.aihealthpred.com/v1';

// Ivy's 0-100 scores are HEALTH scores (higher = better skin). Every
// concern severity in this app is the opposite (0 = clear, 1 = severe), so
// every mapped value is inverted. Keys on the left are the REAL response
// keys observed live, not the documented ones.
const METRIC_TO_CONCERN = {
  pores: 'pore',
  hydration: 'moisture',
  fineLines: 'wrinkle',
  texture: 'texture',
  darkSpots: 'age_spot',
  redness: 'redness',
  // NOTE: no acne/blemish metric exists in Ivy's output at all — confirmed
  // in both their docs and every live response. 'acne' is deliberately
  // absent here and stays on the heuristic engine; see mergeIvyIntoHeatmaps.
};

/**
 * One real analysis call. Returns null (never throws) on any failure —
 * missing key, refusal, timeout, quota, malformed body — because Stage 7 is
 * strictly an ENHANCEMENT over a heuristic path that already works on its
 * own. A vendor problem must degrade to "no vendor data", never break a scan.
 * @returns {Promise<{severities: Record<string, number>, overallHealthScore: number|null, cosmeticSkinType: string|null, scanId: string|null}|null>}
 */
async function analyzeWithIvyAi(photoBase64, { timeoutMs = 40000 } = {}) {
  const key = process.env.IVYAI_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/scan/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: `data:image/jpeg;base64,${photoBase64}` }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    const ms = Date.now() - startedAt;

    if (!res.ok || !body?.success) {
      // A 400 here is usually Ivy correctly refusing an unusable photo, with
      // real reasons attached — logged in full because it's genuinely useful
      // signal, not noise.
      const code = body?.error?.code || `http_${res.status}`;
      const detail = Array.isArray(body?.error?.details) ? ` :: ${body.error.details.join(' | ')}` : '';
      console.warn(`[ivyai] no vendor read (${code}) after ${ms}ms: ${body?.error?.message || res.statusText}${detail}`);
      return null;
    }

    const metrics = body?.data?.analysis?.metrics;
    if (!metrics || typeof metrics !== 'object') {
      console.warn(`[ivyai] response had no metrics object after ${ms}ms — treating as no vendor data`);
      return null;
    }

    const severities = {};
    for (const [metricKey, concernKey] of Object.entries(METRIC_TO_CONCERN)) {
      const score = metrics[metricKey]?.score;
      if (typeof score !== 'number' || Number.isNaN(score)) continue;
      // 0-100 health -> 0-1 severity, clamped defensively.
      severities[concernKey] = Math.max(0, Math.min(1, (100 - score) / 100));
    }
    if (Object.keys(severities).length === 0) {
      console.warn('[ivyai] no recognised metric keys in response — treating as no vendor data');
      return null;
    }

    console.log(`[ivyai] ok in ${ms}ms (vendor ${body?.data?.processingMs}ms) — ${Object.keys(severities).length} concerns mapped`);
    return {
      severities,
      overallHealthScore: body?.data?.analysis?.overallHealthScore ?? null,
      cosmeticSkinType: body?.data?.analysis?.cosmeticSkinType ?? null,
      scanId: body?.data?.scanId ?? null,
    };
  } catch (err) {
    const ms = Date.now() - startedAt;
    const why = err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err.message;
    console.warn(`[ivyai] call failed after ${ms}ms: ${why}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { analyzeWithIvyAi, METRIC_TO_CONCERN };
