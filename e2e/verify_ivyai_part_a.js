// Part A: real vendor validation for Ivy AI's ScanSkinAI Facial Analysis
// API, per the standing project decision — Stage 7 (concern-specific
// routing in My Space) stays on hold until real results against the real
// key are in, so this is not a routing-layer build, just an honest
// evaluation script. Hits the real live endpoint with the real key from
// .env — no mocking, minimal call count (exactly 1 real analyze call, 1
// quota check, 1 deliberate error-path check that should fail validation
// BEFORE consuming a scan) since fsk_live_... is a real metered key.
'use strict';
require('dotenv').config();

const BASE = 'https://facial-scan.aihealthpred.com/v1';
const KEY = process.env.IVYAI_API_KEY;
// Same real face photo used elsewhere in this project's own backend
// verification (e2e/verify_scan_polling.js) — reused here so Part A's
// "does this photo work" isn't testing a different variable than what's
// already validated against Glow's own pipeline.
const PHOTO_URL = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=1080&h=1350&fit=crop&q=80';

// Glow's own 7-concern taxonomy (src/utils/skinConcernContent.js) — the
// thing Stage 7 would actually need to route INTO.
const GLOW_CONCERNS = ['pore', 'moisture', 'wrinkle', 'acne', 'texture', 'age_spot', 'redness'];

// ── Latency-variance sweep (node e2e/verify_ivyai_part_a.js --sweep) ────────
// A single 25.2s data point isn't enough to plan a timeout budget around, so
// this runs N real calls SEQUENTIALLY (never parallel — concurrent calls
// would distort each other's timings and aren't how the real app would call
// this anyway) across a deliberately varied photo set: clean/well-lit,
// occlusion cases (hoodie+glasses, cap, hair across face), lighting extremes
// (low-key/high-key/dramatic), and a range of skin tones. Records wall time
// AND the vendor's own processingMs for each, plus payload size, so a
// size/latency correlation would be visible if one exists.
//
// NOTE on the photo set: this repo has NO face-photo fixtures — every image
// in it is an app screenshot. These are public Unsplash stock portraits,
// verified by eye before use; they are the closest thing to a "standard test
// set" this project has ever had (the first Part A call used the first one).
const SWEEP_PHOTOS = [
  // The single most representative data point in this set: a REAL photo from
  // Glow's own production blob storage, i.e. one that actually went through
  // this app's capture + storedBuf pipeline (1080x1350 fit:inside, q82), at
  // real selfie framing/lighting rather than studio-lit stock. Supplied by
  // the project owner for exactly this evaluation.
  { url: 'https://ctyrsaqlpnvzis1t.public.blob.vercel-storage.com/skin-scans/cmszagc3c00032xnq7pke5mrp-1787393821996.jpg', desc: 'REAL Glow pipeline photo (production capture)' },
  { id: 'photo-1544005313-94ddf0286df2', desc: 'clean, well-lit, light skin (Part A baseline)' },
  { id: 'photo-1507003211169-0a1dd7228f2d', desc: 'clean, well-lit, medium/tan skin' },
  { id: 'photo-1494790108377-be9c29b29330', desc: 'well-lit, light skin, heavy makeup' },
  { id: 'photo-1517841905240-472988babdf9', desc: 'OCCLUSION: hoodie + glasses, small/distant face' },
  { id: 'photo-1580489944761-15a19d654956', desc: 'well-lit, dark skin' },
  { id: 'photo-1506794778202-cad84cf45f1d', desc: 'LOW LIGHT: dark/low-key, bearded' },
  { id: 'photo-1544723795-3fb6469f5b39', desc: 'OCCLUSION: baseball cap + beard, bright bg' },
  { id: 'photo-1524504388940-b1c1722653e1', desc: 'partial occlusion: hair across face, side angle' },
];

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

async function sweep() {
  if (!KEY) throw new Error('IVYAI_API_KEY not set in .env');
  console.log(`=== LATENCY VARIANCE SWEEP — ${SWEEP_PHOTOS.length} real sequential calls ===\n`);
  const rows = [];
  for (let i = 0; i < SWEEP_PHOTOS.length; i++) {
    const p = SWEEP_PHOTOS[i];
    const photoRes = await fetch(p.url || `https://images.unsplash.com/${p.id}?w=1080&h=1350&fit=crop&q=80`);
    const buf = Buffer.from(await photoRes.arrayBuffer());
    const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    const t0 = Date.now();
    let res, body;
    try {
      res = await fetch(`${BASE}/scan/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      body = await res.json();
    } catch (err) {
      console.log(`${i + 1}. FAILED (transport): ${err.message}`);
      rows.push({ i: i + 1, desc: p.desc, kb: Math.round(buf.length / 1024), wallMs: null, procMs: null, ok: false });
      continue;
    }
    const wallMs = Date.now() - t0;
    const ok = res.ok && body?.success;
    const procMs = body?.data?.processingMs ?? null;
    const a = body?.data?.analysis;
    rows.push({ i: i + 1, desc: p.desc, kb: Math.round(buf.length / 1024), wallMs, procMs, ok,
      score: a?.overallHealthScore ?? null, type: a?.cosmeticSkinType ?? null,
      nMetrics: a?.metrics ? Object.keys(a.metrics).length : 0 });
    console.log(`${i + 1}. ${ok ? 'OK ' : 'ERR'} wall=${(wallMs / 1000).toFixed(1)}s proc=${procMs != null ? (procMs / 1000).toFixed(1) + 's' : 'n/a'} ` +
      `${Math.round(buf.length / 1024)}KB score=${a?.overallHealthScore ?? '-'} metrics=${a?.metrics ? Object.keys(a.metrics).length : 0} | ${p.desc}`);
    if (!ok) console.log('    error body:', JSON.stringify(body).slice(0, 300));
  }

  const good = rows.filter((r) => r.ok && r.wallMs != null);
  const walls = good.map((r) => r.wallMs);
  const procs = good.filter((r) => r.procMs != null).map((r) => r.procMs);
  console.log('\n=== SPREAD ===');
  console.log(`Successful calls: ${good.length}/${rows.length}`);
  if (walls.length) {
    console.log(`Wall time  — min ${(Math.min(...walls) / 1000).toFixed(1)}s | median ${(median(walls) / 1000).toFixed(1)}s | max ${(Math.max(...walls) / 1000).toFixed(1)}s`);
    console.log(`  all: ${walls.map((w) => (w / 1000).toFixed(1) + 's').join(', ')}`);
  }
  if (procs.length) {
    console.log(`Vendor processingMs — min ${(Math.min(...procs) / 1000).toFixed(1)}s | median ${(median(procs) / 1000).toFixed(1)}s | max ${(Math.max(...procs) / 1000).toFixed(1)}s`);
  }
  console.log('\n=== OCCLUSION / QUALITY BEHAVIOUR (does it refuse, or confidently guess?) ===');
  for (const r of rows.filter((x) => /OCCLUSION|LOW LIGHT|partial/.test(x.desc))) {
    console.log(`  ${r.ok ? 'RETURNED A FULL READ' : 'refused/errored'} — score=${r.score} metrics=${r.nMetrics} | ${r.desc}`);
  }
  console.log('\nSWEEP COMPLETE');
}

async function main() {
  if (!KEY) throw new Error('IVYAI_API_KEY not set in .env');

  console.log('=== 1. REAL ANALYZE CALL ===');
  const photoRes = await fetch(PHOTO_URL);
  const photoBuf = Buffer.from(await photoRes.arrayBuffer());
  console.log(`Test photo: ${(photoBuf.length / 1024).toFixed(0)}KB`);
  const dataUri = `data:image/jpeg;base64,${photoBuf.toString('base64')}`;

  const t0 = Date.now();
  const analyzeRes = await fetch(`${BASE}/scan/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUri }),
  });
  const wallMs = Date.now() - t0;
  const analyzeBody = await analyzeRes.json();
  console.log(`POST /scan/analyze -> HTTP ${analyzeRes.status} in ${wallMs}ms (vendor-reported: ${analyzeBody?.data?.processingMs}ms)`);
  console.log(JSON.stringify(analyzeBody, null, 2));

  if (!analyzeRes.ok || !analyzeBody.success) {
    console.log('\n!!! Real analyze call did not succeed — stopping here, no further validation possible. !!!');
    process.exit(1);
  }

  const metrics = analyzeBody.data.analysis.metrics;
  const returnedMetricKeys = Object.keys(metrics);
  console.log(`\nReal metric keys returned (${returnedMetricKeys.length}): ${returnedMetricKeys.join(', ')}`);

  console.log('\n=== 2. REAL QUOTA CHECK ===');
  const quotaRes = await fetch(`${BASE}/scan/quota`, { headers: { Authorization: `Bearer ${KEY}` } });
  const quotaBody = await quotaRes.json();
  console.log(`GET /scan/quota -> HTTP ${quotaRes.status}`, JSON.stringify(quotaBody));

  console.log('\n=== 3. ERROR PATH — malformed image (should be a 400, not consume a scan) ===');
  const quotaBefore = quotaBody?.data?.quota?.scansUsed;
  const badRes = await fetch(`${BASE}/scan/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'data:image/jpeg;base64,not-real-base64-data' }),
  });
  const badBody = await badRes.json().catch(() => ({}));
  console.log(`POST /scan/analyze (malformed) -> HTTP ${badRes.status}`, JSON.stringify(badBody));

  const quotaAfterRes = await fetch(`${BASE}/scan/quota`, { headers: { Authorization: `Bearer ${KEY}` } });
  const quotaAfterBody = await quotaAfterRes.json();
  const quotaAfter = quotaAfterBody?.data?.quota?.scansUsed;
  console.log(`Quota before malformed call: ${quotaBefore}, after: ${quotaAfter} (should be unchanged if validation truly failed pre-scan)`);

  console.log('\n=== 4. TAXONOMY FIT — does Ivy AI\'s metric set actually cover Glow\'s 7 concerns? ===');
  // Best-effort naming overlap, reported honestly (a guess at a mapping, not
  // a claim the vendor documents this correspondence themselves).
  const GUESS_MAP = {
    pore: 'poreVisibility', moisture: 'hydration', wrinkle: 'fineLines',
    acne: null, texture: 'texture', age_spot: 'darkSpots', redness: 'redness',
  };
  for (const concern of GLOW_CONCERNS) {
    const ivyKey = GUESS_MAP[concern];
    const present = ivyKey && returnedMetricKeys.includes(ivyKey);
    console.log(`  Glow '${concern}' -> Ivy '${ivyKey ?? '(none)'}': ${present ? 'COVERED' : 'NOT COVERED'}`);
  }
  const extraIvyMetrics = returnedMetricKeys.filter((k) => !Object.values(GUESS_MAP).includes(k));
  console.log(`  Ivy metrics with no Glow concern equivalent: ${extraIvyMetrics.join(', ') || '(none)'}`);

  console.log('\nPART A COMPLETE');
}

const run = process.argv.includes('--sweep') ? sweep : main;
run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
