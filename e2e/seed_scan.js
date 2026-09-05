const { jwtSecret, useDatabase } = require('./_env');
useDatabase();
const prisma = require('../src/lib/prisma');
const jwt = require('../node_modules/jsonwebtoken');

const JWT_SECRET = jwtSecret();

const PHOTO_URL = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=1080&h=1350&fit=crop&q=80';

(async () => {
  const phone = '+19995550099';
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, name: 'Share Card Preview', role: 'CUSTOMER', onboardingComplete: true, phoneVerified: true } });
  }
  let profile = await prisma.skinProfile.findFirst({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.skinProfile.create({ data: { userId: user.id, label: 'You' } });
  }
  // A believable faceBox (fractions of the photo) so the Photo variant's
  // soft glow accent has real geometry to render against, same shape a
  // real client-detected region would have.
  const faceBox = { x: 0.24, y: 0.14, width: 0.52, height: 0.5 };
  const scan = await prisma.skinScan.create({
    data: {
      userId: user.id,
      profileId: profile.id,
      photoUrl: PHOTO_URL,
      skinTone: 'TAN',
      skinType: 'COMBINATION',
      concerns: ['Enlarged pores on nose', 'Mild dryness around cheeks', 'Slight redness on chin', 'Fine lines near the eyes', 'Uneven tone on forehead', 'Visible pores on the chin area'],
      summary: 'Your complexion shows genuinely healthy texture overall, with a bit of light shine concentrated through the T-zone and a noticeable touch of dryness along both cheeks that could use some extra hydration this week.',
      hydrationLevel: 'MODERATE',
      zoneNotes: {
        forehead: 'Light surface shine across the upper T-zone.',
        nose: 'Mild oiliness and slightly enlarged pores along the bridge.',
        cheekL: 'Slight dryness on the left cheek.',
        // Deliberately flagged WITHOUT a matching zoneMarkers entry below —
        // simulates the landmark pass running but not confidently placing
        // this specific zone (occlusion, missing contour). Should show in
        // the text list below the photo but render NO marker on the photo
        // itself, per buildZoneMarkers' new behavior.
        chin: 'Mostly obscured by facial hair, but visible areas look calm.',
      },
      // Only forehead/nose/cheekL have real geometry — chin does not, on
      // purpose (see the zoneNotes.chin comment above).
      zoneMarkers: {
        forehead: { x: 0.38, y: 0.18, width: 0.24, height: 0.1 },
        nose: { x: 0.42, y: 0.32, width: 0.16, height: 0.18 },
        cheekL: { x: 0.26, y: 0.34, width: 0.16, height: 0.14 },
      },
      faceBox,
      recommendations: [{ category: 'Facial', title: 'Hydrating facial', note: 'A gentle hydrating facial would help balance the dryness noted on your cheeks.' }],
      quizAnswers: {},
      notes: '',
    },
  });
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
  console.log(JSON.stringify({ token, user: { id: user.id, name: user.name, role: user.role, phone: user.phone, photoUrl: null, onboardingComplete: true, phoneVerified: true }, scanId: scan.id }));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
