// One-off seed for the Part B web-verification pass (Stage 8 confidence
// fog, Stage 9 photoAligned badge) — NOT a general-purpose fixture, mirrors
// e2e/seed_scan.js's own auth/DB pattern. Creates a dedicated test user
// with two scans:
//   - scan A (newest, photoAligned=true): 3 real concern records built
//     from the SAME production copy/band logic as buildConcernRecord
//     (routes/skin.js) — severity fixed at 0.62 across all three so only
//     confidence.level varies (low/medium/high), matching the earlier
//     design-demo artifact for a direct side-by-side comparison.
//   - scan B (older, photoAligned=false): minimal scan, no heatmaps needed
//     — exists purely to confirm MySpaceScreen's history rail renders the
//     quiet corner-dot badge for it and NOT for scan A.
const { jwtSecret, useDatabase } = require('./_env');
useDatabase();
const prisma = require('../src/lib/prisma');
const jwt = require('../node_modules/jsonwebtoken');
const { CONCERN_CONTENT, severityBand, buildVerdict } = require('../src/utils/skinConcernContent');

const JWT_SECRET = jwtSecret();
const PHOTO_URL = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=1080&h=1350&fit=crop&q=80';

function record(key, confidenceLevel) {
  const severity = 0.62;
  const band = severityBand(severity);
  const content = CONCERN_CONTENT[key];
  return {
    url: PHOTO_URL,
    label: content.label,
    tabLabel: content.tabLabel,
    source: 'estimated',
    gradientLabels: content.gradientLabels,
    severity,
    severityScore: Math.round(severity * 100),
    band,
    verdict: buildVerdict(key, band, []),
    education: content.education,
    tips: content.tips,
    confidence: { level: confidenceLevel },
    zoneBreakdown: [],
  };
}

(async () => {
  const phone = '+19995550299';
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, name: 'Stage 8-9 Verification', role: 'CUSTOMER', onboardingComplete: true, phoneVerified: true } });
  }
  let profile = await prisma.skinProfile.findFirst({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.skinProfile.create({ data: { userId: user.id, label: 'You' } });
  }

  const faceBox = { x: 0.24, y: 0.14, width: 0.52, height: 0.5 };
  const baseData = {
    userId: user.id,
    profileId: profile.id,
    photoUrl: PHOTO_URL,
    skinTone: 'TAN',
    skinType: 'COMBINATION',
    concerns: [],
    summary: 'Seeded for Part B device-verification (Stage 8/9) — not a real scan.',
    hydrationLevel: 'MODERATE',
    zoneNotes: {},
    faceBox,
    recommendations: [],
    quizAnswers: {},
    notes: '',
  };

  const scanB = await prisma.skinScan.create({
    data: { ...baseData, photoAligned: false, createdAt: new Date(Date.now() - 60_000) },
  });

  const heatmaps = {
    redness: record('redness', 'low'),
    pore: record('pore', 'medium'),
    acne: record('acne', 'high'),
  };
  const scanA = await prisma.skinScan.create({
    data: { ...baseData, photoAligned: true, heatmaps, heatmapSource: 'estimated' },
  });

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
  console.log(JSON.stringify({
    token,
    user: { id: user.id, name: user.name, role: user.role, phone: user.phone, photoUrl: null, onboardingComplete: true, phoneVerified: true },
    scanAId: scanA.id,
    scanBId: scanB.id,
  }));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
