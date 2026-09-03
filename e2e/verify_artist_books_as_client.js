// Verifies the "an artist can also book as a client" backend changes against
// the LOCAL running API (:3000) + local postgres (:5433), the same harness
// pattern as seed_scan.js. Run: node e2e/verify_artist_books_as_client.js
process.env.DATABASE_URL = 'postgresql://aassh:glow_local@localhost:5433/glow';
const prisma = require('../src/lib/prisma');
const jwt = require('../node_modules/jsonwebtoken');

const JWT_SECRET = 'd3f1cd3f5e168f66b100f5ef91b45b06aaa386b72d9bcbb428ba83d163252497';
const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function ensureArtist(phone, name) {
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: { phone, name, role: 'Provider', onboardingComplete: true, phoneVerified: true, lat: 46.49, lng: -80.99 },
    });
  } else if (user.role !== 'Provider') {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: 'Provider', lat: 46.49, lng: -80.99 } });
  }
  let profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.providerProfile.create({
      data: { userId: user.id, qualificationType: 'MAKEUP_ARTIST', approvedByAdmin: true, availability: true, specialties: ['Bridal Makeup'], pricingModel: 'PER_SERVICE' },
    });
  } else {
    profile = await prisma.providerProfile.update({ where: { userId: user.id }, data: { approvedByAdmin: true, availability: true, specialties: ['Bridal Makeup'], pricingModel: 'PER_SERVICE' } });
  }
  // A real priced menu entry: POST /bookings resolves a dedicated booking
  // against the artist's own ProviderService rows and 422s ("has not set a
  // price yet") without one. Nothing to do with the role changes under test.
  await prisma.providerService.upsert({
    where:  { profileId_name: { profileId: profile.id, name: 'Bridal Makeup' } },
    update: { price: 120, active: true },
    create: { profileId: profile.id, name: 'Bridal Makeup', price: 120, durationMin: 120, active: true },
  });
  return user;
}

(async () => {
  const artistA = await ensureArtist('+19995550301', 'Artist A (books as client)');
  const artistB = await ensureArtist('+19995550302', 'Artist B (gets booked)');
  const tokenA = jwt.sign({ userId: artistA.id }, JWT_SECRET);
  const tokenB = jwt.sign({ userId: artistB.id }, JWT_SECRET);

  console.log('\n1. Widened role guards (were 403 for a Provider account)');
  for (const path of ['/providers/available', '/providers/nearby?lat=46.49&lng=-80.99', '/bookings/my']) {
    const r = await api(tokenA, 'GET', path);
    check(`GET ${path.split('?')[0]} -> ${r.status}`, r.status === 200, JSON.stringify(r.json).slice(0, 120));
  }

  console.log('\n2. Self-booking is refused');
  const self = await api(tokenA, 'POST', '/bookings', {
    providerId: artistA.id, serviceType: 'Bridal Makeup', hours: 2,
    scheduledAt: new Date(Date.now() + 864e5).toISOString(), lat: 46.49, lng: -80.99,
  });
  check(`POST /bookings (self) -> ${self.status}`, self.status === 400, JSON.stringify(self.json));
  check('refusal names the reason', /own service/i.test(JSON.stringify(self.json)), JSON.stringify(self.json));

  console.log('\n3. Artist A books Artist B');
  const created = await api(tokenA, 'POST', '/bookings', {
    providerId: artistB.id, serviceType: 'Bridal Makeup', hours: 2,
    scheduledAt: new Date(Date.now() + 864e5).toISOString(), lat: 46.49, lng: -80.99,
  });
  check(`POST /bookings -> ${created.status}`, created.status === 201 || created.status === 200, JSON.stringify(created.json).slice(0, 200));
  const bookingId = created.json?.booking?._id || created.json?.booking?.id;
  check('booking id returned', !!bookingId, JSON.stringify(created.json).slice(0, 200));

  if (bookingId) {
    console.log('\n4. GET /bookings/:id role-branch fix (this 404d before)');
    const detail = await api(tokenA, 'GET', `/bookings/${bookingId}`);
    check(`GET /bookings/:id as booking's artist-client -> ${detail.status}`, detail.status === 200, JSON.stringify(detail.json).slice(0, 160));

    console.log('\n5. It appears in their own client booking list');
    const mine = await api(tokenA, 'GET', '/bookings/my');
    const found = (mine.json?.bookings || []).some(b => (b._id || b.id) === bookingId);
    check('booking present in GET /bookings/my', found);
  }

  console.log('\n6. Notification audience');
  const all = await api(tokenA, 'GET', '/notifications');
  const asClient = await api(tokenA, 'GET', '/notifications?audience=CLIENT');
  const asArtist = await api(tokenA, 'GET', '/notifications?audience=ARTIST');
  const bad = await api(tokenA, 'GET', '/notifications?audience=BOGUS');
  check(`GET /notifications -> ${all.status}`, all.status === 200);
  check('CLIENT tab contains the "Booking confirmed" row',
    (asClient.json?.notifications || []).some(n => n.audience === 'CLIENT' && /confirmed/i.test(n.title)));
  check('ARTIST tab excludes that CLIENT row',
    !(asArtist.json?.notifications || []).some(n => n.audience === 'CLIENT'));
  check(`invalid audience rejected -> ${bad.status}`, bad.status === 400);

  // Null handling: a legacy row (audience = null) must appear in BOTH tabs.
  const legacy = await prisma.notification.create({
    data: { userId: artistA.id, type: 'booking', title: 'Legacy row (pre-audience)', body: '', audience: null },
  });
  const c2 = await api(tokenA, 'GET', '/notifications?audience=CLIENT');
  const a2 = await api(tokenA, 'GET', '/notifications?audience=ARTIST');
  const inC = (c2.json?.notifications || []).some(n => n.id === legacy.id);
  const inA = (a2.json?.notifications || []).some(n => n.id === legacy.id);
  check('null-audience row shows in CLIENT tab', inC);
  check('null-audience row shows in ARTIST tab', inA);
  await prisma.notification.delete({ where: { id: legacy.id } });

  console.log('\n7. Artist A does not see their own booking in the job pool');
  // Reopen it to the pool so it is a genuine pool candidate.
  if (bookingId) {
    await prisma.booking.update({ where: { id: bookingId }, data: { openToPool: true, providerId: null } });
    const poolA = await api(tokenA, 'GET', '/jobs/nearby?lat=46.49&lng=-80.99');
    const poolB = await api(tokenB, 'GET', '/jobs/nearby?lat=46.49&lng=-80.99');
    const listA = poolA.json?.jobs || poolA.json?.bookings || [];
    const listB = poolB.json?.jobs || poolB.json?.bookings || [];
    check('own booking absent from A’s Find Jobs', !listA.some(b => (b._id || b.id) === bookingId), `status ${poolA.status}`);
    check('same booking IS visible to another artist (B)', listB.some(b => (b._id || b.id) === bookingId), `status ${poolB.status}, ${listB.length} jobs`);

    const acceptSelf = await api(tokenA, 'POST', `/jobs/${bookingId}/accept`, {});
    check(`A cannot accept own booking -> ${acceptSelf.status}`, acceptSelf.status === 400, JSON.stringify(acceptSelf.json));
  }

  console.log('\n8. Regression: a plain CUSTOMER account is unaffected');
  // The role guards were WIDENED (Provider added), never narrowed, and the
  // /bookings/:id non-Provider branch is untouched — this proves it rather
  // than asserting it, since every one of those routes is on the customer's
  // critical path.
  let cust = await prisma.user.findUnique({ where: { phone: '+19995550303' } });
  if (!cust) {
    cust = await prisma.user.create({
      data: { phone: '+19995550303', name: 'Plain Customer', role: 'CUSTOMER', onboardingComplete: true, phoneVerified: true, lat: 46.49, lng: -80.99 },
    });
  }
  const tokenC = jwt.sign({ userId: cust.id }, JWT_SECRET);
  for (const path of ['/providers/available', '/bookings/my', '/notifications']) {
    const r = await api(tokenC, 'GET', path);
    check(`CUSTOMER GET ${path} -> ${r.status}`, r.status === 200);
  }
  const custBooking = await api(tokenC, 'POST', '/bookings', {
    providerId: artistB.id, serviceType: 'Bridal Makeup', hours: 2,
    scheduledAt: new Date(Date.now() + 864e5).toISOString(), lat: 46.49, lng: -80.99,
  });
  check(`CUSTOMER can still book -> ${custBooking.status}`, custBooking.status === 201, JSON.stringify(custBooking.json).slice(0, 160));
  const custBookingId = custBooking.json?.booking?._id || custBooking.json?.booking?.id;
  if (custBookingId) {
    const d = await api(tokenC, 'GET', `/bookings/${custBookingId}`);
    check(`CUSTOMER GET /bookings/:id -> ${d.status}`, d.status === 200);
    // And an unrelated artist still must NOT see a dedicated booking that
    // isn't theirs — the widened guards must not have opened that up.
    const peek = await api(tokenA, 'GET', `/bookings/${custBookingId}`);
    check(`unrelated artist still cannot read it -> ${peek.status}`, peek.status === 404, JSON.stringify(peek.json).slice(0, 120));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('HARNESS ERROR:', e); await prisma.$disconnect(); process.exit(2); });
