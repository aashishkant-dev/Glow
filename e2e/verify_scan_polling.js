// Direct HTTP integration test for the new POST /skin/scan async/polling
// path (routes/skin.js's runScanPipeline + GET /scan/jobs/:jobId/status) —
// hits the real backend, real DB, real Gemini call, real blob storage, no
// mocking. Three checks:
//   1. Async happy path: async:true returns 202+jobId almost immediately,
//      polling observes real stage transitions, ends at status:'done' with
//      a real scan.
//   2. Sync backward-compat: the exact same request WITHOUT async:true
//      still returns 201 with the full scan body directly, unchanged —
//      confirms an older, not-yet-updated client is unaffected.
//   3. Async error path: a deliberately degenerate image (QC failure,
//      caught before Gemini) transitions the job to status:'error' with the
//      right message via polling, not a direct HTTP 400 — since by the time
//      that failure is discovered, the initial POST has already returned.
'use strict';
const { jwtSecret, useDatabase } = require('./_env');
const jwt = require('../node_modules/jsonwebtoken');
const sharp = require('../node_modules/sharp');

const JWT_SECRET = jwtSecret();
const BASE = 'http://localhost:3000';
const PHOTO_URL = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=1080&h=1350&fit=crop&q=80';

useDatabase();
const prisma = require('../src/lib/prisma');

async function ensureUser(phone, name) {
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) user = await prisma.user.create({ data: { phone, name, role: 'CUSTOMER', onboardingComplete: true, phoneVerified: true } });
  return user;
}

function tokenFor(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
}

async function fetchRealFacePhotoBase64() {
  const res = await fetch(PHOTO_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

async function degenerateImageBase64() {
  // A tiny flat-gray square — real sharpness scoring will read this as
  // essentially zero variance-of-Laplacian, i.e. a genuine QC rejection,
  // not a fabricated one. Never reaches Gemini (rejected before that
  // stage), so this costs nothing against the free-tier quota.
  const buf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 128, g: 128, b: 128 } } }).jpeg().toBuffer();
  return buf.toString('base64');
}

async function poll(token, jobId, { intervalMs = 1000, maxMs = 70000 } = {}) {
  const startedAt = Date.now();
  const stages = [];
  while (Date.now() - startedAt < maxMs) {
    const res = await fetch(`${BASE}/skin/scan/jobs/${jobId}/status`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (body.status === 'processing') {
      if (stages[stages.length - 1] !== body.stage) { stages.push(body.stage); console.log(`  [+${elapsed}s] stage -> ${body.stage}`); }
    } else {
      console.log(`  [+${elapsed}s] status -> ${body.status}${body.error ? ' (' + body.error + ')' : ''}`);
      return { httpOk: res.ok, body, stages, totalMs: Date.now() - startedAt };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Polling exceeded maxMs=${maxMs} without reaching a terminal status`);
}

(async () => {
  const user = await ensureUser('+19995550399', 'Async Poll Verification');
  const token = tokenFor(user);
  const photoBase64 = await fetchRealFacePhotoBase64();

  console.log('=== 1. ASYNC HAPPY PATH ===');
  const t0 = Date.now();
  const postRes = await fetch(`${BASE}/skin/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ photoBase64, async: true }),
  });
  const postMs = Date.now() - t0;
  const postBody = await postRes.json();
  console.log(`POST /skin/scan (async:true) -> HTTP ${postRes.status} in ${postMs}ms`, postBody);
  if (postRes.status !== 202 || !postBody.jobId) throw new Error('Expected 202 + jobId — async kickoff did not behave as designed');
  if (postMs > 5000) throw new Error(`POST took ${postMs}ms — should return almost immediately, not block on the pipeline`);

  const final = await poll(token, postBody.jobId);
  if (final.body.status !== 'done') throw new Error(`Expected status 'done', got: ${JSON.stringify(final.body)}`);
  if (!final.body.scan || !final.body.scan.id) throw new Error('done status missing a real scan object');
  console.log(`Async path: real scan ${final.body.scan.id} created in ${(final.totalMs / 1000).toFixed(1)}s total, observed stages: ${final.stages.join(' -> ')}`);

  console.log('\n=== 2. SYNC BACKWARD-COMPAT (no async flag) ===');
  const t1 = Date.now();
  const syncRes = await fetch(`${BASE}/skin/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ photoBase64 }), // no `async` field at all — exactly what an older client sends
  });
  const syncMs = Date.now() - t1;
  const syncBody = await syncRes.json();
  console.log(`POST /skin/scan (no async flag) -> HTTP ${syncRes.status} in ${(syncMs / 1000).toFixed(1)}s, scan id: ${syncBody?.scan?.id}`);
  if (syncRes.status !== 201 || !syncBody.scan || !syncBody.scan.id) throw new Error('Old synchronous contract broke — this is a real regression');

  console.log('\n=== 3. ASYNC ERROR PATH (QC failure, degenerate image) ===');
  const badBase64 = await degenerateImageBase64();
  const badPostRes = await fetch(`${BASE}/skin/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ photoBase64: badBase64, async: true }),
  });
  const badPostBody = await badPostRes.json();
  console.log(`POST /skin/scan (bad image, async:true) -> HTTP ${badPostRes.status}`, badPostBody);
  if (badPostRes.status !== 202 || !badPostBody.jobId) throw new Error('Expected 202 + jobId even for a photo that will fail QC — the failure is discovered INSIDE the job, not at kickoff');

  const badFinal = await poll(token, badPostBody.jobId, { intervalMs: 500, maxMs: 15000 });
  if (badFinal.body.status !== 'error') throw new Error(`Expected status 'error' for a degenerate image, got: ${JSON.stringify(badFinal.body)}`);
  if (!badFinal.httpOk) throw new Error('Status endpoint should return HTTP 200 even when the underlying job errored — the job state, not the poll request, carries the failure');
  console.log(`Async error path confirmed: job errored with "${badFinal.body.error}" (HTTP 200 on the status poll itself, as designed)`);

  console.log('\nALL CHECKS PASSED');
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
