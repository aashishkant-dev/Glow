#!/usr/bin/env node
'use strict';
/**
 * Seed demo marketplace data (local dev + App Store review).
 *
 * Creates:
 *   - 5 approved demo Artists spread around Greater Sudbury, each with a
 *     priced service menu (ProviderService rows) so real per-service pricing
 *     is testable end-to-end, not the $40 fallback.
 *   - 1 demo customer whose completed bookings give the Artists real ratings
 *   - Reviewer account (DEMO_REVIEW_PHONE) with booking history on BOTH sides
 *   - Notification rows so the reviewer's bell/history screen is populated
 *
 * All demo rows are identifiable:
 *   - users: phone in the reserved +1705555xxxx range (never routable)
 *   - bookings/notifications: tagged with DEMO_TAG in notes/body
 * Run scripts/cleanup-demo.js to purge everything after approval.
 *
 * Idempotent: users are upserted by phone; tagged bookings/notifications are
 * deleted and recreated on each run.
 *
 * Usage (prod):
 *   ALLOW_PROD_SEED=1 DEMO_REVIEW_PHONE=+1705xxxxxxx node scripts/seed-demo.js
 */
require('dotenv').config();
const prisma = require('../src/lib/prisma');

const DEMO_TAG = '[demo-seed]';
const FALLBACK_RATE = 40;
const fee = (total) => Math.max(2, total * 0.18);

// Reserved 555 range — not routable, no real user can ever own these numbers.
const ARTISTS = [
  {
    phone: '+17055550101', name: 'Marie Tremblay', gender: 'F',
    lat: 46.5136, lng: -80.9631, // New Sudbury
    bio: 'Bridal & editorial makeup artist with 8 years behind the brush. Trained in Toronto, now taking bookings across Greater Sudbury. Known for soft-glam looks that photograph beautifully.',
    languages: ['English', 'French'], experienceYears: 8, rating: 4.9,
    qualificationType: 'MAKEUP_ARTIST',
    specialties: ['Bridal Makeup', 'Party Makeup', 'Hair Styling'],
    services: [
      { name: 'Bridal Makeup', price: 280, durationMin: 180 },
      { name: 'Party Makeup', price: 85, durationMin: 90 },
      { name: 'Hair Styling', price: 50, durationMin: 60 },
    ],
  },
  {
    phone: '+17055550102', name: 'James Whitfield', gender: 'M',
    lat: 46.4649, lng: -80.9931, // South End
    bio: 'Licensed esthetician specializing in skin — facials, waxing, and brow shaping. Cambrian College grad, 5 years in-studio and mobile.',
    languages: ['English'], experienceYears: 5, rating: 4.8,
    qualificationType: 'ESTHETICIAN',
    specialties: ['Facial', 'Waxing', 'Threading'],
    services: [
      { name: 'Facial', price: 60, durationMin: 60 },
      { name: 'Waxing', price: 45, durationMin: 45 },
      { name: 'Threading', price: 12, durationMin: 20 },
    ],
  },
  {
    phone: '+17055550103', name: 'Sophie Lefebvre', gender: 'F',
    lat: 46.6111, lng: -81.0104, // Val Caron
    bio: 'Bilingual hair colorist serving the Valley area — balayage, full color, and precision cuts. Every appointment starts with a consult so the color is right the first time.',
    languages: ['French', 'English'], experienceYears: 6, rating: 5.0,
    qualificationType: 'HAIR_STYLIST',
    specialties: ['Hair Coloring', 'Hair Styling', 'Facial'],
    services: [
      { name: 'Hair Coloring', price: 110, durationMin: 120 },
      { name: 'Hair Styling', price: 45, durationMin: 60 },
      { name: 'Facial', price: 55, durationMin: 60 },
    ],
  },
  {
    phone: '+17055550104', name: 'Priya Sharma', gender: 'F',
    lat: 46.4917, lng: -81.0095, // Downtown
    bio: 'Nail artist and mehendi specialist — gel sets, nail art, and bridal henna. Instagram-famous for intricate freehand designs.',
    languages: ['English'], experienceYears: 3, rating: 4.7,
    qualificationType: 'NAIL_TECH',
    specialties: ['Nails', 'Mehendi', 'Massage'],
    services: [
      { name: 'Nails', price: 38, durationMin: 60 },
      { name: 'Mehendi', price: 55, durationMin: 90 },
      { name: 'Massage', price: 70, durationMin: 60 },
    ],
  },
  {
    phone: '+17055550105', name: 'Aiden Brooks', gender: 'M',
    lat: 46.5250, lng: -80.9450, // Garson
    bio: 'Men\'s grooming and everyday makeup specialist — quick, clean, reliable. Perfect for events, headshots, and last-minute glow-ups.',
    languages: ['English'], experienceYears: 4, rating: 4.6,
    qualificationType: 'MAKEUP_ARTIST',
    specialties: ['Makeup', 'Hair Styling', 'Threading'],
    services: [
      { name: 'Makeup', price: 65, durationMin: 60 },
      { name: 'Hair Styling', price: 40, durationMin: 45 },
      { name: 'Threading', price: 10, durationMin: 20 },
    ],
  },
];

const DEMO_CUSTOMER = {
  phone: '+17055550110', name: 'Eleanor Bisson',
  lat: 46.4953, lng: -80.9976, address: '155 Elm St, Sudbury, ON',
};

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000);
const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000);

async function upsertUser(u, role, extra = {}) {
  return prisma.user.upsert({
    where: { phone: u.phone },
    update: { name: u.name, role, ...extra },
    create: {
      role, name: u.name, phone: u.phone,
      gender: u.gender ?? null,
      lat: u.lat, lng: u.lng,
      address: u.address ?? '',
      isVerified: true, onboardingComplete: true,
      rating: u.rating ?? 0, ratingCount: u.rating ? 1 : 0,
      ...extra,
    },
  });
}

async function upsertProviderProfile(userId, p) {
  const data = {
    qualificationType: p.qualificationType ?? 'Other',
    bio: p.bio,
    languages: p.languages,
    experienceYears: p.experienceYears ?? 0,
    specialties: p.specialties,
    availability: true,
    approvedByAdmin: true,
    publicProfile: true,
    policeCheckCleared: true,
    firstAidCertified: true,
  };
  const profile = await prisma.providerProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  if (p.services?.length) {
    const catalog = await prisma.serviceItem.findMany({ where: { active: true } });
    for (const s of p.services) {
      const match = catalog.find(c => c.name === s.name);
      await prisma.providerService.upsert({
        where: { profileId_name: { profileId: profile.id, name: s.name } },
        update: { price: s.price, durationMin: s.durationMin, active: true, serviceItemId: match?.id ?? null },
        create: { profileId: profile.id, name: s.name, price: s.price, durationMin: s.durationMin, serviceItemId: match?.id ?? null },
      });
    }
  }
  return profile;
}

function servicePrice(p, serviceType) {
  const svc = p.services?.find(s => s.name === serviceType);
  return svc ? svc.price : FALLBACK_RATE;
}

async function createBooking({ customerId, providerId, status, hoursCount, scheduledAt, serviceType, price, opts = {} }) {
  return prisma.booking.create({
    data: {
      customerId, providerId, serviceType,
      hours: hoursCount, status, scheduledAt,
      lat: DEMO_CUSTOMER.lat, lng: DEMO_CUSTOMER.lng,
      address: DEMO_CUSTOMER.address,
      price, platformFee: fee(price), providerPayout: price - fee(price),
      notes: `${DEMO_TAG} ${opts.notes ?? ''}`.trim(),
      recipientName: opts.recipientName ?? DEMO_CUSTOMER.name,
      paymentStatus: opts.paymentStatus ?? (status === 'COMPLETED' ? 'PAID' : 'PENDING'),
      startedAt: status === 'COMPLETED' ? new Date(scheduledAt) : null,
      ratingGiven: !!opts.ratingValue,
      ratingValue: opts.ratingValue ?? null,
      ratingComment: opts.ratingComment ?? '',
      providerRequestedAt: status === 'REQUESTED' ? new Date() : null,
      openToPool: false,
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== '1') {
    console.error('✘ Set ALLOW_PROD_SEED=1 to seed demo data in production.');
    process.exit(1);
  }

  // ── Wipe previously seeded bookings/notifications (idempotent re-run) ──
  const stale = await prisma.booking.findMany({
    where: { notes: { contains: DEMO_TAG } }, select: { id: true },
  });
  if (stale.length) {
    const ids = stale.map(b => b.id);
    await prisma.message.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    console.log(`♻  Removed ${ids.length} previously seeded bookings`);
  }
  await prisma.notification.deleteMany({ where: { body: { contains: DEMO_TAG } } });

  // ── Demo Artists ──
  const artistUsers = [];
  for (const p of ARTISTS) {
    const u = await upsertUser(p, 'Provider');
    await upsertProviderProfile(u.id, p);
    artistUsers.push(u);
    console.log(`✅ Artist ${u.name} (${u.phone})`);
  }

  // ── Demo customer + rated history so Artist ratings are backed by bookings ──
  const cust = await upsertUser(DEMO_CUSTOMER, 'CUSTOMER');
  console.log(`✅ Customer ${cust.name} (${cust.phone})`);

  const ratings = [
    [4.9, 'Marie made my wedding day perfect. Soft glam, exactly what I asked for.', 'Bridal Makeup'],
    [4.8, 'James is so gentle with waxing, best I\'ve had in Sudbury.', 'Waxing'],
    [5.0, 'Sophie is amazing with color. My balayage grew out perfectly.', 'Hair Coloring'],
    [4.7, 'Priya\'s nail art is stunning, will book again for my next event.', 'Nails'],
    [4.6, 'Aiden was quick and professional before my headshots.', 'Makeup'],
  ];
  for (let i = 0; i < artistUsers.length; i++) {
    const serviceType = ratings[i][2];
    await createBooking({
      customerId: cust.id, providerId: artistUsers[i].id,
      status: 'COMPLETED', hoursCount: 2,
      scheduledAt: hoursAgo(72 + i * 24),
      serviceType, price: servicePrice(ARTISTS[i], serviceType),
      opts: { ratingValue: ratings[i][0], ratingComment: ratings[i][1] },
    });
    await prisma.user.update({
      where: { id: artistUsers[i].id },
      data: { rating: ratings[i][0], ratingCount: 1 },
    });
  }
  console.log('✅ Rated history bookings created');

  // ── Reviewer account (both sides) ──
  const reviewerPhone = process.env.DEMO_REVIEW_PHONE;
  if (!reviewerPhone) {
    console.log('⚠  DEMO_REVIEW_PHONE not set — skipped reviewer bookings. Set it and re-run.');
  } else {
    const reviewer = await prisma.user.upsert({
      where: { phone: reviewerPhone },
      update: { isVerified: true, onboardingComplete: true },
      create: {
        role: 'CUSTOMER', name: 'App Reviewer', phone: reviewerPhone,
        lat: 46.4917, lng: -80.9930, address: '200 Larch St, Sudbury, ON',
        isVerified: true, onboardingComplete: true,
      },
    });
    const reviewerProfile = {
      bio: 'Demo reviewer Artist profile for App Store review.',
      languages: ['English'], experienceYears: 2,
      specialties: ['Threading'], qualificationType: 'ESTHETICIAN',
      services: [{ name: 'Threading', price: 12, durationMin: 20 }],
    };
    // Provider profile so the role-switch path lands on a working, pre-approved Artist side.
    await upsertProviderProfile(reviewer.id, reviewerProfile);

    // As customer: one completed+rated, one upcoming accepted.
    await createBooking({
      customerId: reviewer.id, providerId: artistUsers[0].id,
      status: 'COMPLETED', hoursCount: 2, scheduledAt: hoursAgo(48),
      serviceType: 'Threading', price: 12,
      opts: { ratingValue: 5.0, ratingComment: 'Excellent, thank you Marie!', recipientName: 'App Reviewer' },
    });
    await createBooking({
      customerId: reviewer.id, providerId: artistUsers[1].id,
      status: 'ACCEPTED', hoursCount: 2, scheduledAt: hoursFromNow(48),
      serviceType: 'Makeup', price: servicePrice(ARTISTS[1], 'Makeup'),
      opts: { recipientName: 'App Reviewer' },
    });

    // As Artist: one incoming dedicated request, one completed job with earnings.
    await createBooking({
      customerId: cust.id, providerId: reviewer.id,
      status: 'REQUESTED', hoursCount: 1, scheduledAt: hoursFromNow(24),
      serviceType: 'Threading', price: 12,
      opts: { notes: 'Please review the incoming request flow.' },
    });
    await createBooking({
      customerId: cust.id, providerId: reviewer.id,
      status: 'COMPLETED', hoursCount: 1, scheduledAt: hoursAgo(96),
      serviceType: 'Threading', price: 12,
      // paymentStatus: RELEASED — funds already paid out to the Artist's wallet,
      // so the Earnings dashboard demos a real "Earned" balance instead of $0.
      opts: { ratingValue: 4.8, ratingComment: 'Quick and precise.', paymentStatus: 'RELEASED' },
    });

    // Notifications so the bell screen has history.
    const notif = (type, title, body, extra = {}) =>
      prisma.notification.create({ data: { userId: reviewer.id, type, title, body: `${body} ${DEMO_TAG}`, ...extra } });
    await notif('booking', 'Artist accepted', 'James Whitfield accepted your booking and will be on the way.');
    await notif('rating', 'New rating', 'You received a 4.8★ rating.');
    await notif('request', 'New booking request', 'A client requested you — tap to review.');
    console.log(`✅ Reviewer data seeded for ${reviewerPhone}`);
  }

  console.log('\nDone. Run scripts/cleanup-demo.js after App Store approval to purge demo data.');
}

main()
  .catch((e) => { console.error('✘ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
