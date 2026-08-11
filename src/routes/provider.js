// src/routes/provider.js
'use strict';

const express  = require('express');
const prisma   = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendPush, pushTo } = require('../utils/push');
const { notify } = require('../utils/notify');
const { cacheGet, cacheSet, cacheDel, cacheFlushPattern } = require('../utils/cache');
const { listedPriceFor, computeFees } = require('../utils/pricing');

const router = express.Router();

const NEARBY_RADIUS_KM = () => parseFloat(process.env.NEARBY_RADIUS_KM) || 15;

// Prisma Decimal → JS number coercion
function toNum(v) { return v == null ? v : parseFloat(v.toString()); }

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// No platform commission — mirrors utils/pricing.js. Provider never sees the
// platform cut field regardless; this fallback now just returns full price.
const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0;
const COMMISSION_MIN  = parseFloat(process.env.COMMISSION_MIN) || 0;
function providerPayoutFor(price) {
  const fee = Math.max(Math.round((price || 0) * COMMISSION_RATE * 100) / 100, COMMISSION_MIN);
  return Math.round(((price || 0) - fee) * 100) / 100;
}

// Helper: format booking for API response.
// Provider-facing: we expose ONLY providerPayout (their take-home). We deliberately do NOT
// send price/platformFee so the app cannot show the gross charge or our cut.
function formatBooking(b) {
  if (!b) return b;
  const { price, platformFee, id, customer, provider, services, ...rest } = b;
  const payout = toNum(b.providerPayout != null ? b.providerPayout : providerPayoutFor(toNum(price)));
  return {
    ...rest,
    _id:          id,
    providerPayout:    payout,
    totalPrice:   payout, // back-compat alias: legacy UI reads totalPrice — now = payout, never gross
    // Per-line service items — the artist's OWN quoted price per service.
    // `price`/`platformFee` stay destructured out above: a provider never sees
    // the gross charge or the platform cut, only their per-line quote and payout.
    services:     services ? services.map(s => ({
      _id:           s.id,
      serviceItemId: s.serviceItemId ?? null,
      name:          s.name,
      price:         toNum(s.price),
      durationMin:   s.durationMin,
    })) : undefined,
    tipAmount:    toNum(rest.tipAmount),
    ratingValue:  toNum(rest.ratingValue),
    providerRatingValue: toNum(rest.providerRatingValue),
    customer:     customer ? { ...customer, _id: customer.id, rating: toNum(customer.rating) } : undefined,
    provider:          provider      ? { ...provider,      _id: provider.id,      rating: toNum(provider.rating)      } : undefined,
  };
}

// ── Helper: assert Provider is approved ────────────────────────────────────────────
async function assertApprovedProvider(userId, res) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile)                { res.status(403).json({ error: 'Provider profile not found. Contact admin.' }); return null; }
  if (!profile.approvedByAdmin){ res.status(403).json({ error: 'Your account is pending admin approval.' }); return null; }
  return profile;
}

// ── PATCH /jobs/location ──────────────────────────────────────────────────────
router.patch(
  '/location',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { lat, lng, bookingId } = req.body;
      // Note: don't use `!lat || !lng` — a valid coordinate can be 0 (equator /
      // prime meridian), and !0 is truthy, which would wrongly reject it.
      if (lat == null || lng == null || !bookingId) {
        return res.status(400).json({ error: 'lat, lng, and bookingId required' });
      }
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }

      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, providerId: req.user.id, status: { in: ['ACCEPTED', 'ON_MY_WAY', 'STARTED'] } },
      });
      if (!booking) return res.status(404).json({ error: 'Active booking not found' });

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          providerLocationLat:       parsedLat,
          providerLocationLng:       parsedLng,
          providerLocationUpdatedAt: new Date(),
        },
      });
      // Also keep the Provider's canonical location fresh so distance-to-client on the
      // Requests inbox works even when they aren't on the Find Jobs screen.
      await prisma.user.update({
        where: { id: req.user.id },
        data:  { lat: parsedLat, lng: parsedLng },
      }).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      console.error('PATCH /jobs/location error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /jobs/my-location ────────────────────────────────────────────────────
// Always-on canonical location write (NO active booking required). Any authenticated
// user — Provider or CUSTOMER — keeps their own user.lat/lng fresh here.
//   • Provider: app-wide GPS broadcast calls this every tick → "X km away" on Requests/Find Jobs.
//   • CUSTOMER: LocationContext calls this when coords resolve → bookings created without
//     live GPS still get a real client position via the customer-coords fallback, so the
//     Provider sees an accurate distance to the client.
router.patch(
  '/my-location',
  authenticate,
  async (req, res) => {
    try {
      const { lat, lng } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ error: 'lat and lng required' });
      }
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }
      await prisma.user.update({
        where: { id: req.user.id },
        data:  { lat: parsedLat, lng: parsedLng, lastSeenAt: new Date() },
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('PATCH /jobs/my-location error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /location-settings — where the Provider works + business hours ──────
// Body: { homeService?, salonService?, salonAddress?, serviceRadiusKm?, businessHours? }
// businessHours shape: { mon: "9:00 AM - 6:00 PM", tue: "Closed", ... } — any subset of
// day keys (mon..sun); missing keys read as "not set" on the client.
const HOUR_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
router.patch(
  '/location-settings',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const { homeService, salonService, salonAddress, serviceRadiusKm, businessHours } = req.body;
      const data = {};
      if (homeService !== undefined) data.homeService = Boolean(homeService);
      if (salonService !== undefined) data.salonService = Boolean(salonService);
      if (salonAddress !== undefined) data.salonAddress = String(salonAddress).trim().slice(0, 200);
      if (serviceRadiusKm !== undefined) {
        const r = Number(serviceRadiusKm);
        if (Number.isNaN(r) || r < 1 || r > 200) return res.status(400).json({ error: 'serviceRadiusKm must be 1-200' });
        data.serviceRadiusKm = Math.round(r);
      }
      if (businessHours !== undefined) {
        if (typeof businessHours !== 'object' || businessHours === null || Array.isArray(businessHours)) {
          return res.status(400).json({ error: 'businessHours must be an object' });
        }
        const clean = {};
        for (const day of HOUR_DAY_KEYS) {
          if (typeof businessHours[day] === 'string') clean[day] = businessHours[day].trim().slice(0, 40);
        }
        data.businessHours = clean;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided' });
      }

      const updated = await prisma.providerProfile.update({ where: { userId: req.user.id }, data });
      cacheFlushPattern('providers:*').catch(() => {});
      res.json({
        homeService: updated.homeService,
        salonService: updated.salonService,
        salonAddress: updated.salonAddress || '',
        serviceRadiusKm: updated.serviceRadiusKm,
        businessHours: updated.businessHours || {},
      });
    } catch (err) {
      console.error('PATCH /location-settings error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /jobs/nearby ──────────────────────────────────────────────────────────
router.get(
  '/nearby',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });

      const { lat, lng } = req.query;
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const hasNewCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

      let providerUser;
      if (hasNewCoords) {
        providerUser = await prisma.user.update({
          where: { id: req.user.id },
          data:  { lat: parsedLat, lng: parsedLng },
          select: { lat: true, lng: true },
        });
      } else {
        providerUser = await prisma.user.findUnique({
          where:  { id: req.user.id },
          select: { lat: true, lng: true },
        });
      }

      // Region centre — fully env-driven per deployment (DEFAULT_REGION_LAT/LNG),
      // used ONLY to build the job-search bounding box when the Provider hasn't
      // shared GPS yet, so Find Jobs isn't empty. Real coords are always preferred.
      // Falls back to 0,0 if unset — deliberately useless as a real map centre so
      // a missing env var is obvious in production rather than silently defaulting
      // to some other product's city.
      const REGION_LAT = parseFloat(process.env.DEFAULT_REGION_LAT) || 0;
      const REGION_LNG = parseFloat(process.env.DEFAULT_REGION_LNG) || 0;
      const providerLat = (providerUser?.lat && providerUser.lat !== 0) ? providerUser.lat : REGION_LAT;
      const providerLng = (providerUser?.lng && providerUser.lng !== 0) ? providerUser.lng : REGION_LNG;

      // Load Provider's active bookings once for conflict marking
      const activeBookings = await prisma.booking.findMany({
        where: { providerId: req.user.id, status: { in: ['ACCEPTED', 'ON_MY_WAY', 'STARTED'] } },
        select: { scheduledAt: true, hours: true },
      });

      // Bounding-box pre-filter: 1 degree lat ≈ 111km, 1 degree lng ≈ 79km at 46°N.
      // Pre-filter to a square roughly 2× the radius before haversine in JS.
      const radiusKm   = NEARBY_RADIUS_KM();
      const latDelta   = radiusKm / 111.0;
      const lngDelta   = radiusKm / (111.0 * Math.cos(providerLat * (Math.PI / 180)));

      // Find Jobs shows the open pool: bookings with no assigned Provider, PLUS
      // dedicated bookings that were opened to the pool (the chosen Provider declined
      // or didn't respond in time). Active dedicated requests still live only in
      // the chosen Provider's Requests inbox.
      const poolWhere = {
        status: 'REQUESTED',
        OR: [
          { providerId: null },
          { openToPool: true },
        ],
      };

      const allRequested = await prisma.booking.findMany({
        where: {
          ...poolWhere,
          lat: { gte: providerLat - latDelta, lte: providerLat + latDelta },
          lng: { gte: providerLng - lngDelta, lte: providerLng + lngDelta },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, rating: true, photoUrl: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
        },
        take: 200, // hard cap — bounding box should already be tight
      });

      // Jobs whose address failed to geocode (lat/lng null) fall OUTSIDE the
      // bounding box and were silently dropped — Providers reported "recent jobs not
      // showing". Pull them in separately and show them with no distance rather
      // than hiding real work.
      // lat/lng are non-nullable; 0/0 is the "geocode failed / unknown" marker
      // (see customer.js create). Spreading `OR:` here would also clobber
      // poolWhere's own OR — AND the two conditions instead.
      const noGeo = await prisma.booking.findMany({
        where: {
          AND: [poolWhere, { lat: 0, lng: 0 }],
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, rating: true, photoUrl: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
        },
        take: 50,
      });

      const urgencyRank = { emergency: 0, urgent: 1, routine: 2 };

      const located = allRequested
        .map(b => {
          const distanceKm = haversineKm(providerLat, providerLng, b.lat, b.lng);
          return { ...b, distanceKm: Math.round(distanceKm * 10) / 10, distanceMeters: distanceKm * 1000 };
        })
        .filter(b => b.distanceKm <= radiusKm);

      // Un-geocoded jobs sort after located ones (Infinity distance) but stay visible.
      const unlocated = noGeo.map(b => ({ ...b, distanceKm: undefined, distanceMeters: Infinity }));

      const bookings = await Promise.all([...located, ...unlocated]
        .sort((a, b) => {
          const uDiff = (urgencyRank[a.urgency] ?? 2) - (urgencyRank[b.urgency] ?? 2);
          if (uDiff !== 0) return uDiff;
          if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
          return (b.customer?.rating ?? 0) - (a.customer?.rating ?? 0);
        })
        .map(async b => {
          const jobStart = new Date(b.scheduledAt).getTime();
          const jobEnd   = jobStart + b.hours * 3600 * 1000;
          const hasConflict = activeBookings.some(active => {
            const aStart = new Date(active.scheduledAt).getTime();
            const aEnd   = aStart + active.hours * 3600 * 1000;
            return aStart < jobEnd && aEnd > jobStart;
          });
          const { price, platformFee, id, customer, provider, services, ...rest } = b;
          // Open-pool job (price still null — no artist has claimed it yet): show
          // THIS viewing Provider's own quote for the service, not a stale/zero
          // number — the price only actually locks in when they accept.
          const effectivePrice = price != null ? toNum(price) : await listedPriceFor(b.serviceType, b.hours, req.user.id);
          const payout = toNum(b.providerPayout != null ? b.providerPayout : providerPayoutFor(effectivePrice));
          return {
            ...rest,
            _id:        id,
            providerPayout:  payout,
            totalPrice: payout, // alias = payout; never expose gross to Provider
            services:   services ? services.map(s => ({
              _id:           s.id,
              serviceItemId: s.serviceItemId ?? null,
              name:          s.name,
              price:         toNum(s.price),
              durationMin:   s.durationMin,
            })) : undefined,
            hasConflict,
            customer:   customer ? { ...customer, _id: customer.id, rating: toNum(customer.rating) } : undefined,
            provider:        provider      ? { ...provider,      _id: provider.id,      rating: toNum(provider.rating)      } : undefined,
          };
        }));

      // Filter out jobs this Provider has already skipped
      const skipped = providerSkippedJobs.get(req.user.id) ?? new Set();
      const filteredBookings = bookings.filter(b => !skipped.has(b._id));

      res.json({ bookings: filteredBookings, approvedByAdmin: profile?.approvedByAdmin ?? false });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /jobs/requests ──────────────────────────────────────────────────────────
// Persistent inbox of DEDICATED requests addressed to THIS Provider (client picked them).
// Unlike /jobs/nearby this is NOT distance-filtered — a client's chosen caregiver
// must always see their request, no matter how far. Replaces the timed flash card.
router.get(
  '/requests',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: req.user.id }, select: { approvedByAdmin: true },
      });

      // Provider's own coordinates (stored on the User row, kept fresh by GPS broadcast).
      // Used to surface "X km away" on each request card. Treat 0/0 or null as
      // "unknown" — better to omit distance than show a wrong "0 km".
      const providerUser = await prisma.user.findUnique({
        where:  { id: req.user.id },
        select: { lat: true, lng: true },
      });
      const providerLat = (providerUser?.lat && providerUser.lat !== 0) ? providerUser.lat : null;
      const providerLng = (providerUser?.lng && providerUser.lng !== 0) ? providerUser.lng : null;

      const requested = await prisma.booking.findMany({
        where:   { providerId: req.user.id, status: 'REQUESTED' },
        orderBy: { scheduledAt: 'asc' },
        // Include the customer's stored coords so we can still show distance for
        // older bookings that were created without booking.lat/lng.
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, rating: true, ratingCount: true, photoUrl: true, lat: true, lng: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
        },
        take:    100,
      });

      const bookings = requested.map(b => {
        const { price, platformFee, id, customer, provider, services, ...rest } = b;
        // Client position: prefer the booking's own coords, else the customer's
        // stored location. Distance only when both Provider + client coords are real.
        const cLat = (b.lat && b.lat !== 0) ? b.lat : (customer?.lat && customer.lat !== 0 ? customer.lat : null);
        const cLng = (b.lng && b.lng !== 0) ? b.lng : (customer?.lng && customer.lng !== 0 ? customer.lng : null);
        let distanceKm;
        if (providerLat != null && providerLng != null && cLat != null && cLng != null) {
          distanceKm = Math.round(haversineKm(providerLat, providerLng, cLat, cLng) * 10) / 10;
        }
        const safeCustomer = customer ? { ...customer, _id: customer.id, rating: toNum(customer.rating) } : undefined;
        if (safeCustomer) { delete safeCustomer.lat; delete safeCustomer.lng; } // don't leak exact client coords
        const payout = toNum(b.providerPayout != null ? b.providerPayout : providerPayoutFor(toNum(price)));
        return {
          ...rest,
          _id:        id,
          providerPayout:  payout,
          totalPrice: payout, // alias = payout; never expose gross to Provider
          services:   services ? services.map(s => ({
            _id:           s.id,
            serviceItemId: s.serviceItemId ?? null,
            name:          s.name,
            price:         toNum(s.price),
            durationMin:   s.durationMin,
          })) : undefined,
          distanceKm,
          customer:   safeCustomer,
        };
      });

      res.json({ requests: bookings, count: bookings.length, approvedByAdmin: profile?.approvedByAdmin ?? false });
    } catch (err) {
      console.error('GET /jobs/requests error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /jobs/:id/skip ───────────────────────────────────────────────────────
// Provider declines/skips a REQUESTED job. Booking stays REQUESTED (other Providers can still take it).
// We store skipped IDs in-memory per Provider — lightweight, no DB schema change needed.
const providerSkippedJobs = new Map(); // Map<providerId, Set<bookingId>>

router.post(
  '/:id/skip',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const bookingId = req.params.id;
      // Optional decline reason from the Provider (shown to the client).
      const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
      if (!providerSkippedJobs.has(req.user.id)) {
        providerSkippedJobs.set(req.user.id, new Set());
      }
      providerSkippedJobs.get(req.user.id).add(bookingId);

      // If this Provider was the one the client requested, declining must release the
      // assignment so the client can pick someone else. NEVER touches payment.
      //
      // updateMany's `where` re-asserts BOTH "still assigned to me" and "still
      // in a declinable status" at write time — a plain findUnique-then-update
      // has a gap where the booking could be reassigned/cancelled by another
      // request between the read and this write, and an unconditional update
      // would blindly stomp that outcome back to REQUESTED. If `count` is 0,
      // something else already changed this booking's assignment/status —
      // this skip correctly becomes a no-op instead of clobbering it.
      const declineClaim = await prisma.booking.updateMany({
        where: {
          id: bookingId,
          providerId: req.user.id,
          status: { in: ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY'] },
        },
        // Back to "needs a Provider" AND opened to the whole nearby pool so any Provider
        // can pick it up — the client isn't stuck re-choosing. Payment unchanged.
        data:  { providerId: null, status: 'REQUESTED', openToPool: true },
      });
      if (declineClaim.count > 0) {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        const io = req.app.get('io');
        if (io) {
          io.to(`user-${booking.customerId}`).emit('booking-status-changed', {
            bookingId, status: 'REQUESTED', reason: 'provider-declined', declineReason: reasonRaw,
          });
          io.to('admin-room').emit('booking-status-changed', { bookingId, status: 'REQUESTED' });
        }
        // Notify the client their Provider declined — they should choose another.
        notify({
          userId: booking.customerId,
          type: 'cancelled',
          title: 'Your Provider is unavailable',
          body: reasonRaw
            ? `Reason: ${reasonRaw}. Please choose another Provider.`
            : 'The Provider you requested can’t take this booking. Please choose another Provider.',
          bookingId,
        }).catch(() => {});
      }
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /jobs/:id/accept ──────────────────────────────────────────────────────
router.post(
  '/:id/accept',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await assertApprovedProvider(req.user.id, res);
      if (!profile) return;

      const targetBooking = await prisma.booking.findFirst({
        where: { id: req.params.id, status: 'REQUESTED' },
      });
      if (!targetBooking) {
        return res.status(404).json({ error: 'Booking not found or already claimed' });
      }

      // Dedicated booking: if the client requested a specific Provider, only THAT Provider
      // may accept it — UNLESS it's been opened to the pool (the original Provider
      // didn't respond in time, or declined; see requestTimeoutSweep.js). Once
      // openToPool is true, any Provider seeing it in Find Jobs must actually be
      // able to accept it — before this fix, GET /jobs/nearby correctly listed
      // these as open, but every accept attempt from a different Provider always
      // 403'd here regardless of openToPool, a permanent dead end that looked
      // like "I can see jobs but can't accept them."
      if (targetBooking.providerId && targetBooking.providerId !== req.user.id && !targetBooking.openToPool) {
        return res.status(403).json({ error: 'This booking was requested for a different Provider.' });
      }

      // Conflict detection
      const jobStart = new Date(targetBooking.scheduledAt);
      const jobEnd   = new Date(jobStart.getTime() + targetBooking.hours * 3600 * 1000);

      const conflict = await prisma.booking.findFirst({
        where: {
          providerId:  req.user.id,
          status: { in: ['ACCEPTED', 'ON_MY_WAY', 'STARTED'] },
          scheduledAt: { lt: jobEnd },
        },
      });

      // Additional JS check: existing job ends after new job starts
      if (conflict) {
        const conflictEnd = new Date(conflict.scheduledAt.getTime() + conflict.hours * 3600 * 1000);
        if (conflictEnd > jobStart) {
          return res.status(409).json({
            error: 'You already have an active booking that overlaps this time slot.',
          });
        }
      }

      // Open-pool booking (no artist chosen at request time): price was left
      // null on creation — the artist alone controls price, so it's resolved
      // HERE, from the accepting artist's own listed price, never before.
      // Dedicated bookings already carry the requested artist's real price
      // from creation time and are left untouched.
      let priceUpdate = {};
      let repriceLines = null;
      if (targetBooking.price == null) {
        const listedPrice = await listedPriceFor(targetBooking.serviceType, targetBooking.hours, req.user.id);
        if (listedPrice == null) {
          return res.status(422).json({ error: 'Set a price for this service before accepting jobs.' });
        }
        const { platformFee, providerPayout } = computeFees(listedPrice);
        priceUpdate = { price: listedPrice, platformFee, providerPayout };
        // The booking's line items were written at request time with price 0 —
        // no artist existed then, so no menu price existed either. Now that
        // THIS artist has claimed it, stamp their real price onto the line so
        // the itemized job view doesn't show $0 next to a real payout.
        repriceLines = listedPrice;
      }

      // Atomic claim: updateMany's `where` (not just its `data`) carries the
      // `status: 'REQUESTED'` guard, so the UPDATE statement itself only
      // matches a row still in that state — the read-then-write gap above
      // (find, conflict check, this claim) is a real window where two
      // Providers can both pass every check before either write commits.
      // A plain `update({ where: { id } })` has no status guard on the WRITE
      // and would let the second writer silently overwrite the first
      // (double-booking, no error to either side). `updateMany` + `count`
      // is Prisma's compare-and-swap: only one concurrent request's WHERE
      // clause still matches by the time its UPDATE actually runs.
      const claim = await prisma.booking.updateMany({
        where: { id: req.params.id, status: 'REQUESTED' },
        data:  { providerId: req.user.id, status: 'ACCEPTED', openToPool: false, ...priceUpdate },
      });
      if (claim.count === 0) {
        return res.status(409).json({ error: 'This job was just claimed by another Provider.' });
      }

      if (repriceLines != null) {
        // Open-pool bookings carry exactly one line item (see POST /bookings),
        // so the whole listed price belongs to that single line.
        //
        // That invariant is load-bearing but not enforced by the schema: this
        // writes the FULL resolved price to every matched row, so if a future
        // change ever lets an open-pool booking carry multiple lines, a blind
        // updateMany would charge the full price N times over — a silent
        // overcharge. Check it explicitly and refuse to reprice instead, so
        // the failure is loud and debuggable rather than invisible.
        const lineCount = await prisma.bookingService.count({
          where: { bookingId: req.params.id },
        });
        if (lineCount !== 1) {
          console.error(
            `[accept] Refusing to reprice booking ${req.params.id}: expected exactly 1 ` +
            `line item for an open-pool booking, found ${lineCount}. Line prices left ` +
            `untouched to avoid overcharging; booking price is ${repriceLines}.`,
          );
          return res.status(500).json({ error: 'Server error' });
        }

        await prisma.bookingService.updateMany({
          where: { bookingId: req.params.id },
          data:  { price: repriceLines },
        });
      }

      const booking = await prisma.booking.findUnique({
        where: { id: req.params.id },
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, address: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, photoUrl: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
        },
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`booking:${booking.id}`).emit('booking-status-changed', {
          bookingId: booking.id,
          status: 'ACCEPTED',
          providerName: req.user.name,
        });
        io.to(`user-${booking.customerId}`).emit('booking-status-changed', {
          bookingId: booking.id,
          status: 'ACCEPTED',
          providerName: req.user.name,
        });
        io.to('admin-room').emit('admin-event', {
          type: 'booking',
          text: `${req.user.name} accepted booking #${booking.id.slice(-6)}`,
          time: new Date(),
        });
        io.to('admin-room').emit('booking-status-changed', { bookingId: booking.id, status: 'ACCEPTED' });
      }

      notify({
        userId: booking.customerId,
        type: 'accepted',
        title: 'Provider Accepted Your Booking',
        body: `${req.user.name} has accepted your booking and is on the way!`,
        bookingId: booking.id,
      }).catch(() => {});

      cacheFlushPattern(`provider:jobs:my:${req.user.id}*`).catch(() => {});
      cacheFlushPattern(`bookings:my:${booking.customerId}*`).catch(() => {});
      cacheDel(`bookings:${booking.id}:${booking.customerId}`).catch(() => {});

      res.json({ message: 'Job accepted', booking: formatBooking(booking) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /jobs/:id/on-my-way ───────────────────────────────────────────────────
router.post(
  '/:id/on-my-way',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const existing = await prisma.booking.findFirst({
        where: { id: req.params.id, providerId: req.user.id },
      });
      if (!existing) return res.status(404).json({ error: 'Booking not found' });
      if (existing.status !== 'ACCEPTED') return res.status(400).json({ error: 'Booking must be ACCEPTED' });

      const booking = await prisma.booking.update({
        where: { id: req.params.id },
        data:  { status: 'ON_MY_WAY', providerArrivingAt: new Date() },
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, address: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, photoUrl: true } },
        },
      });

      const ioWay = req.app.get('io');
      if (ioWay) {
        ioWay.to(`booking:${booking.id}`).emit('booking-status-changed', {
          bookingId: booking.id,
          status: 'ON_MY_WAY',
          providerName: req.user.name,
        });
        ioWay.to(`user-${booking.customerId}`).emit('booking-status-changed', {
          bookingId: booking.id,
          status: 'ON_MY_WAY',
          providerName: req.user.name,
        });
      }

      notify({
        userId: booking.customerId,
        type: 'enroute',
        title: 'Your Provider is on the way!',
        body: `${req.user.name} is heading to you now.`,
        bookingId: booking.id,
      }).catch(() => {});

      res.json({ booking: formatBooking(booking) });
    } catch (err) {
      console.error('POST /jobs/:id/on-my-way error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /jobs/:id/start ───────────────────────────────────────────────────────
router.post(
  '/:id/start',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const existing = await prisma.booking.findFirst({
        where: { id: req.params.id, providerId: req.user.id, status: { in: ['ACCEPTED', 'ON_MY_WAY'] } },
      });
      if (!existing) {
        return res.status(404).json({
          error: 'Booking not found, not assigned to you, or not in ACCEPTED state',
        });
      }

      const booking = await prisma.booking.update({
        where: { id: req.params.id },
        data:  { status: 'STARTED', startedAt: new Date() },
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, address: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, photoUrl: true } },
        },
      });

      const ioStart = req.app.get('io');
      if (ioStart) {
        ioStart.to(`booking:${booking.id}`).emit('booking-status-changed', {
          bookingId: booking.id,
          status: 'STARTED',
          providerName: req.user.name,
        });
        ioStart.to(`user-${booking.customerId}`).emit('booking-status-changed', {
          bookingId: booking.id,
          status: 'STARTED',
          providerName: req.user.name,
        });
      }

      notify({
        userId: booking.customerId,
        type: 'started',
        title: 'Service has started',
        body: `${req.user.name} has begun your care session.`,
        bookingId: booking.id,
      }).catch(() => {});

      cacheFlushPattern(`provider:jobs:my:${req.user.id}*`).catch(() => {});
      cacheFlushPattern(`bookings:my:${booking.customerId}*`).catch(() => {});
      cacheDel(`bookings:${booking.id}:${booking.customerId}`).catch(() => {});

      res.json({ message: 'Job started', booking: formatBooking(booking) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /jobs/:id/complete ────────────────────────────────────────────────────
router.post(
  '/:id/complete',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const existing = await prisma.booking.findFirst({
        where: { id: req.params.id, providerId: req.user.id, status: 'STARTED' },
      });
      if (!existing) {
        return res.status(404).json({
          error: 'Booking not found, not assigned to you, or not in STARTED state',
        });
      }

      const booking = await prisma.booking.update({
        where: { id: req.params.id },
        data: {
          status:        'COMPLETED',
          paymentStatus: 'RELEASED',
          serviceNotes:     req.body.serviceNotes ? req.body.serviceNotes.trim().slice(0, 2000) : existing.serviceNotes,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, address: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, photoUrl: true } },
        },
      });

      cacheDel(`provider:earnings:${req.user.id}`).catch(() => {});

      const ioComplete = req.app.get('io');
      if (ioComplete) {
        ioComplete.to('admin-room').emit('admin-event', {
          type: 'booking',
          text: `${req.user.name} completed booking #${booking.id.slice(-6)}`,
          time: new Date(),
        });
        ioComplete.to('admin-room').emit('booking-status-changed', { bookingId: booking.id, status: 'COMPLETED' });
        ioComplete.to(`booking:${booking.id}`).emit('booking-status-changed', { bookingId: booking.id, status: 'COMPLETED' });
        ioComplete.to(`user-${booking.customerId}`).emit('booking-status-changed', { bookingId: booking.id, status: 'COMPLETED' });
      }

      notify({
        userId: booking.customerId,
        type: 'rating',
        title: 'Service completed',
        body: `${req.user.name} has finished your care session. Please leave a rating!`,
        bookingId: booking.id,
      }).catch(() => {});

      cacheFlushPattern(`provider:jobs:my:${req.user.id}*`).catch(() => {});
      cacheFlushPattern(`bookings:my:${booking.customerId}*`).catch(() => {});
      cacheDel(`bookings:${booking.id}:${booking.customerId}`).catch(() => {});

      res.json({ message: 'Job completed. Payment released to Provider.', booking: formatBooking(booking) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /jobs/:id/rate-customer ──────────────────────────────────────────────
router.post(
  '/:id/rate-customer',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { rating, comment } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'rating must be 1–5' });
      }

      const booking = await prisma.booking.findFirst({
        where: { id: req.params.id, providerId: req.user.id, status: 'COMPLETED' },
      });
      if (!booking) return res.status(404).json({ error: 'Completed booking not found' });
      if (booking.providerRatingGiven) return res.status(409).json({ error: 'Already rated this customer' });
      if (!booking.customerId) return res.status(400).json({ error: 'No customer on booking' });

      const customer = await prisma.user.findUnique({
        where:  { id: booking.customerId },
        select: { rating: true, ratingCount: true },
      });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });

      const newCount  = customer.ratingCount + 1;
      const newRating = Math.round(((customer.rating * customer.ratingCount + Number(rating)) / newCount) * 10) / 10;

      await prisma.user.update({
        where: { id: booking.customerId },
        data:  { rating: newRating, ratingCount: newCount },
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          providerRatingGiven:   true,
          providerRatingValue:   Number(rating),
          providerRatingComment: comment?.trim() ?? '',
        },
      });

      res.json({ message: 'Customer rated successfully' });
    } catch (err) {
      console.error('POST /jobs/:id/rate-customer error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /jobs/availability ───────────────────────────────────────────────────
router.patch(
  '/availability',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { available } = req.body;
      if (typeof available !== 'boolean') {
        return res.status(400).json({ error: 'available must be true or false' });
      }

      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

      await prisma.providerProfile.update({
        where: { userId: req.user.id },
        data:  { availability: available },
      });

      await Promise.all([
        cacheDel('providers:available'),
        cacheFlushPattern('providers:nearby:*'),
      ]);

      res.json({ message: `Availability set to ${available}`, availability: available });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /jobs/public-profile ─────────────────────────────────────────────────
// Marketing consent: whether this Provider is showcased on the public landing page.
router.patch(
  '/public-profile',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { publicProfile } = req.body;
      if (typeof publicProfile !== 'boolean') {
        return res.status(400).json({ error: 'publicProfile must be true or false' });
      }

      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

      await prisma.providerProfile.update({
        where: { userId: req.user.id },
        data:  { publicProfile },
      });

      await cacheDel('public:providers');

      res.json({ message: `Public profile set to ${publicProfile}`, publicProfile });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /jobs/my ───────────────────────────────────────────────────────────────
const MY_JOBS_VALID_STATUSES = ['ACCEPTED', 'ON_MY_WAY', 'STARTED', 'COMPLETED', 'CANCELLED'];

router.get(
  '/my',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const where = {
        providerId:  req.user.id,
        status: { in: MY_JOBS_VALID_STATUSES },
      };

      const { status, since } = req.query;
      if (status) {
        if (!MY_JOBS_VALID_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Invalid status value' });
        }
        where.status = status;
      }
      if (since) {
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
          return res.status(400).json({ error: 'Invalid since date' });
        }
        where.updatedAt = { gt: sinceDate };
      }

      const cacheKey = (!since && !req.query.nocache) ? `provider:jobs:my:${req.user.id}${status ? `:${status}` : ''}` : null;
      if (cacheKey) {
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);
      }

      const bookings = await prisma.booking.findMany({
        where,
        orderBy: { scheduledAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, rating: true, address: true, photoUrl: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
        },
      });

      const result = { bookings: bookings.map(formatBooking) };
      if (cacheKey) await cacheSet(cacheKey, result, 5);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /earnings ──────────────────────────────────────────────────────────────
router.get(
  '/earnings',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const cacheKey = `provider:earnings:${req.user.id}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const allJobs = await prisma.booking.findMany({
        where: {
          providerId: req.user.id,
          status: { in: ['ACCEPTED', 'ON_MY_WAY', 'STARTED', 'COMPLETED'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true } } },
      });

      let totalEarned    = 0;
      let pendingRelease = 0;

      for (const b of allJobs) {
        const payout = toNum(b.providerPayout) || 0;
        if (b.paymentStatus === 'RELEASED') {
          totalEarned += payout;
        } else if (['ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(b.status)) {
          pendingRelease += payout;
        }
      }

      const breakdown = allJobs.map(b => ({
        _id:           b.id,
        date:          b.createdAt,
        customerName:  b.customer?.name ?? 'Customer',
        serviceType:   b.serviceType,
        hours:         b.hours,
        providerPayout:     toNum(b.providerPayout != null ? b.providerPayout : providerPayoutFor(toNum(b.price))),
        totalPrice:    toNum(b.providerPayout != null ? b.providerPayout : providerPayoutFor(toNum(b.price))),
        status:        b.status,
        paymentStatus: b.paymentStatus,
      }));

      // Mock wallet: available = lifetime RELEASED earnings minus what Provider already withdrew.
      const profile = await prisma.providerProfile.findUnique({
        where:  { userId: req.user.id },
        select: { walletWithdrawn: true },
      });
      const withdrawn = profile?.walletWithdrawn || 0;
      const available = Math.max(0, totalEarned - withdrawn);

      const response = {
        totalEarned:    Math.round(totalEarned * 100) / 100,
        pendingRelease: Math.round(pendingRelease * 100) / 100,
        // Wallet
        available:      Math.round(available * 100) / 100,
        withdrawn:      Math.round(withdrawn * 100) / 100,
        breakdown,
      };

      await cacheSet(cacheKey, response, 30);
      res.json(response);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /earnings/withdraw ─────────────────────────────────────────────────────
// Mock withdraw — moves available balance to "withdrawn" (no real payout yet; Stripe later).
router.post(
  '/earnings/withdraw',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const released = await prisma.booking.findMany({
        where:  { providerId: req.user.id, paymentStatus: 'RELEASED' },
        select: { providerPayout: true },
      });
      const totalEarned = released.reduce((s, b) => s + (toNum(b.providerPayout) || 0), 0);

      const profile = await prisma.providerProfile.findUnique({
        where:  { userId: req.user.id },
        select: { walletWithdrawn: true, payoutEmail: true },
      });
      const withdrawn = profile?.walletWithdrawn || 0;
      const available = Math.round((totalEarned - withdrawn) * 100) / 100;

      if (!profile?.payoutEmail) {
        return res.status(400).json({ error: 'Add an Interac e-Transfer email before withdrawing.', code: 'NO_PAYOUT_METHOD' });
      }
      if (available <= 0) {
        return res.status(400).json({ error: 'No available balance to withdraw.' });
      }

      await prisma.providerProfile.update({
        where: { userId: req.user.id },
        data:  { walletWithdrawn: totalEarned },
      });

      cacheDel(`provider:earnings:${req.user.id}`).catch(() => {});

      res.json({
        withdrawn:  available,                 // amount moved this call
        available:  0,
        totalWithdrawn: Math.round(totalEarned * 100) / 100,
        message: `$${available.toFixed(2)} sent via Interac e-Transfer to ${profile.payoutEmail} (mock — arrives in 1–2 business days).`,
      });
    } catch (err) {
      console.error('POST /earnings/withdraw error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /payout-method ──────────────────────────────────────────────────────────
router.get(
  '/payout-method',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({
        where:  { userId: req.user.id },
        select: { payoutEmail: true, payoutMethod: true },
      });
      res.json({
        payoutEmail:  profile?.payoutEmail || '',
        payoutMethod: profile?.payoutMethod || 'ETRANSFER',
        configured:   !!(profile?.payoutEmail),
      });
    } catch (err) {
      console.error('GET /payout-method error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /payout-method ──────────────────────────────────────────────────────────
// Pre-Stripe: store the Interac e-Transfer email. Validated, not charged.
router.patch(
  '/payout-method',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { payoutEmail } = req.body;
      if (typeof payoutEmail !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payoutEmail.trim())) {
        return res.status(400).json({ error: 'A valid e-Transfer email is required.' });
      }
      const updated = await prisma.providerProfile.update({
        where: { userId: req.user.id },
        data:  { payoutEmail: payoutEmail.trim(), payoutMethod: 'ETRANSFER' },
        select: { payoutEmail: true, payoutMethod: true },
      });
      res.json({ payoutEmail: updated.payoutEmail, payoutMethod: updated.payoutMethod, configured: true });
    } catch (err) {
      console.error('PATCH /payout-method error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /provider/:id/reviews ───────────────────────────────────────────────────────
router.get(
  '/provider/:id/reviews',
  authenticate,
  async (req, res) => {
    try {
      const bookings = await prisma.booking.findMany({
        where:   { providerId: req.params.id, status: 'COMPLETED', ratingGiven: true },
        orderBy: { updatedAt: 'desc' },
        take:    20,
        include: { customer: { select: { name: true } } },
      });

      const reviews = bookings.map(b => ({
        rating:      toNum(b.ratingValue) ?? 0,
        comment:     b.ratingComment ?? '',
        createdAt:   b.updatedAt,
        customerName: b.customer?.name ?? 'Anonymous',
        serviceType: b.serviceType,
      }));

      res.json({ reviews });
    } catch (e) {
      console.error('GET /jobs/provider/:id/reviews error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  }
);


// ── Provider service menu (price list) ────────────────────────────────────────
// GET /services — the provider's own menu
router.get(
  '/services',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });
      const services = await prisma.providerService.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ services: services.map(s => ({ ...s, price: toNum(s.price) })) });
    } catch (err) {
      console.error('GET /provider/services error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /pricing — update the provider's pricing model and rate ──────────────
router.patch(
  '/pricing',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const { pricingModel, hourlyRate, priceNegotiable } = req.body;
      const data = {};
      if (pricingModel !== undefined) data.pricingModel = pricingModel === 'PER_SERVICE' ? 'PER_SERVICE' : 'HOURLY';
      if (hourlyRate !== undefined)   data.hourlyRate = Number(hourlyRate) || 25;
      if (priceNegotiable !== undefined) data.priceNegotiable = Boolean(priceNegotiable);

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No valid pricing fields provided' });
      }

      const updated = await prisma.providerProfile.update({ where: { userId: req.user.id }, data });
      cacheFlushPattern('providers:*').catch(() => {});
      res.json({
        pricingModel: updated.pricingModel,
        hourlyRate: toNum(updated.hourlyRate),
        priceNegotiable: updated.priceNegotiable,
      });
    } catch (err) {
      console.error('PATCH /pricing error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// PUT /services — replace the provider's menu with the posted list
// Body: { services: [{ name, price, durationMin, active }] }
router.put(
  '/services',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const list = Array.isArray(req.body.services) ? req.body.services : null;
      if (!list) return res.status(400).json({ error: 'services must be an array' });
      if (list.length > 50) return res.status(400).json({ error: 'Too many services (max 50)' });

      const clean = [];
      const seen = new Set();
      for (const s of list) {
        const name = String(s?.name || '').trim().slice(0, 80);
        const price = Number(s?.price);
        const durationMin = Number(s?.durationMin) || 60;
        if (!name || Number.isNaN(price) || price < 0 || price > 100000) {
          return res.status(400).json({ error: 'Each service needs a name and a valid price' });
        }
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        clean.push({ name, price, durationMin: Math.min(Math.max(durationMin, 5), 720), active: s?.active !== false });
      }

      // Link to the platform catalog when the name matches (case-insensitive)
      const items = await prisma.serviceItem.findMany({ where: { active: true }, select: { id: true, name: true } });
      const itemByName = new Map(items.map(i => [i.name.toLowerCase(), i.id]));

      const services = await prisma.$transaction(async (tx) => {
        await tx.providerService.deleteMany({ where: { profileId: profile.id } });
        for (const s of clean) {
          await tx.providerService.create({
            data: { ...s, profileId: profile.id, serviceItemId: itemByName.get(s.name.toLowerCase()) || null },
          });
        }
        return tx.providerService.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: 'asc' } });
      });

      cacheFlushPattern('providers:*').catch(() => {});
      res.json({ services: services.map(s => ({ ...s, price: toNum(s.price) })) });
    } catch (err) {
      console.error('PUT /provider/services error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
