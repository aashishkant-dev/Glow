#!/usr/bin/env node
'use strict';
/**
 * Seed demo marketplace data for App Store review.
 *
 * Creates:
 *   - 4 approved demo Providers spread around Greater Sudbury (visible in Find Providers)
 *   - 1 demo customer whose completed bookings give the Providers real ratings
 *   - Reviewer account (DEMO_REVIEW_PHONE) with booking history on BOTH sides:
 *       as customer: 1 completed+rated booking, 1 upcoming accepted booking
 *       as Provider:      1 incoming job request, 1 completed job with earnings
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
const HOURLY = 25;
const fee = (total) => Math.max(10, total * 0.18);

// Reserved 555 range — not routable, no real user can ever own these numbers.
const PROVIDERS = [
  {
    phone: '+17055550101', name: 'Marie Tremblay', gender: 'F',
    lat: 46.5136, lng: -80.9631, // New Sudbury
    bio: 'Certified Provider with 8 years of experience in senior home care. Fluent in English and French. Specializes in dementia care and medication reminders. / PSS certifiée, 8 ans d’expérience en soins à domicile.',
    languages: ['English', 'French'], experienceYears: 8, rating: 4.9,
    specialties: ['Bridal Makeup', 'Party Makeup', 'Hair Styling'],
  },
  {
    phone: '+17055550102', name: 'James Whitfield', gender: 'M',
    lat: 46.4649, lng: -80.9931, // South End
    bio: 'Provider graduate from Cambrian College with 5 years in home and facility care. Comfortable with mobility assistance, transfers, and post-surgery recovery support.',
    languages: ['English'], experienceYears: 5, rating: 4.8,
    specialties: ['Facial', 'Waxing', 'Threading'],
  },
  {
    phone: '+17055550103', name: 'Sophie Lefebvre', gender: 'F',
    lat: 46.6111, lng: -81.0104, // Val Caron
    bio: 'Bilingual Provider serving the Valley area. Experienced with palliative support, personal hygiene assistance, and respite care for family caregivers. / PSS bilingue desservant la Vallée.',
    languages: ['French', 'English'], experienceYears: 6, rating: 5.0,
    specialties: ['Palliative Support', 'Respite Care', 'Personal Hygiene'],
  },
  {
    phone: '+17055550104', name: 'Priya Sharma', gender: 'F',
    lat: 46.4917, lng: -81.0095, // Downtown
    bio: 'Compassionate Provider with hospital and home-care experience. Strong focus on companionship, light housekeeping, and accompanying clients to appointments.',
    languages: ['English'], experienceYears: 3, rating: 4.7,
    specialties: ['Nails', 'Mehendi', 'Massage'],
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
    qualificationType: 'Provider',
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
  return prisma.providerProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

async function createBooking({ customerId, providerId, status, hoursCount, scheduledAt, serviceType, opts = {} }) {
  const price = HOURLY * hoursCount;
  return prisma.booking.create({
    data: {
      customerId, providerId, serviceType,
      hours: hoursCount, status, scheduledAt,
      lat: DEMO_CUSTOMER.lat, lng: DEMO_CUSTOMER.lng,
      address: DEMO_CUSTOMER.address,
      price, platformFee: fee(price), providerPayout: price - fee(price),
      notes: `${DEMO_TAG} ${opts.notes ?? ''}`.trim(),
      recipientName: opts.recipientName ?? DEMO_CUSTOMER.name,
      paymentStatus: status === 'COMPLETED' ? 'PAID' : 'PENDING',
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

  // ── Demo Providers ──
  const providerUsers = [];
  for (const p of PROVIDERS) {
    const u = await upsertUser(p, 'Provider');
    await upsertProviderProfile(u.id, p);
    providerUsers.push(u);
    console.log(`✅ Provider ${u.name} (${u.phone})`);
  }

  // ── Demo customer + rated history so Provider ratings are backed by bookings ──
  const cust = await upsertUser(DEMO_CUSTOMER, 'CUSTOMER');
  console.log(`✅ Customer ${cust.name} (${cust.phone})`);

  const ratings = [[4.9, 'Marie was wonderful with my mother. Patient, kind, and always on time.'],
                   [4.8, 'James helped my father recover after his hip surgery. Very professional.'],
                   [5.0, 'Sophie est formidable. Compassionate and reliable — highly recommend.'],
                   [4.7, 'Priya keeps my aunt company twice a week. She looks forward to every visit.']];
  for (let i = 0; i < providerUsers.length; i++) {
    await createBooking({
      customerId: cust.id, providerId: providerUsers[i].id,
      status: 'COMPLETED', hoursCount: 3,
      scheduledAt: hoursAgo(72 + i * 24),
      serviceType: 'Makeup',
      opts: { ratingValue: ratings[i][0], ratingComment: ratings[i][1] },
    });
    await prisma.user.update({
      where: { id: providerUsers[i].id },
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
    // Provider profile so the role-switch path lands on a working, pre-approved Provider side.
    await upsertProviderProfile(reviewer.id, {
      bio: 'Demo reviewer Provider profile for App Store review.',
      languages: ['English'], experienceYears: 2,
      specialties: ['Threading'],
    });

    // As customer: one completed+rated, one upcoming accepted.
    await createBooking({
      customerId: reviewer.id, providerId: providerUsers[0].id,
      status: 'COMPLETED', hoursCount: 3, scheduledAt: hoursAgo(48),
      serviceType: 'Threading',
      opts: { ratingValue: 5.0, ratingComment: 'Excellent care, thank you Marie!', recipientName: 'App Reviewer' },
    });
    await createBooking({
      customerId: reviewer.id, providerId: providerUsers[1].id,
      status: 'ACCEPTED', hoursCount: 3, scheduledAt: hoursFromNow(48),
      serviceType: 'Makeup',
      opts: { recipientName: 'App Reviewer' },
    });

    // As Provider: one incoming dedicated request, one completed job with earnings.
    await createBooking({
      customerId: cust.id, providerId: reviewer.id,
      status: 'REQUESTED', hoursCount: 3, scheduledAt: hoursFromNow(24),
      serviceType: 'Threading',
      opts: { notes: 'Please review the incoming request flow.' },
    });
    await createBooking({
      customerId: cust.id, providerId: reviewer.id,
      status: 'COMPLETED', hoursCount: 4, scheduledAt: hoursAgo(96),
      serviceType: 'Facial',
      opts: { ratingValue: 4.8, ratingComment: 'Great help around the house.' },
    });

    // Notifications so the bell screen has history.
    const notif = (type, title, body, extra = {}) =>
      prisma.notification.create({ data: { userId: reviewer.id, type, title, body: `${body} ${DEMO_TAG}`, ...extra } });
    await notif('booking', 'Provider accepted', 'James Whitfield accepted your booking and will be on the way.');
    await notif('rating', 'New rating', 'You received a 4.8★ rating.');
    await notif('request', 'New care request', 'A client requested you — tap to review.');
    console.log(`✅ Reviewer data seeded for ${reviewerPhone}`);
  }

  console.log('\nDone. Run scripts/cleanup-demo.js after App Store approval to purge demo data.');
}

main()
  .catch((e) => { console.error('✘ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
