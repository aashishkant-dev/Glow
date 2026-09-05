// src/routes/provider.js
'use strict';

const express  = require('express');
const sharp    = require('sharp');
const prisma   = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendPush, pushTo } = require('../utils/push');
const { notify } = require('../utils/notify');
const { cacheGet, cacheSet, cacheDel, cacheFlushPattern } = require('../utils/cache');
const { listedPriceFor, computeFees } = require('../utils/pricing');
const { uploadFile } = require('../utils/storage');
const { PHOTO_FILTERS } = require('../utils/photoFilters');
const { CATEGORIES } = require('../utils/categories');

const router = express.Router();

const NEARBY_RADIUS_KM = () => parseFloat(process.env.NEARBY_RADIUS_KM) || 15;

// A provider's own serviceRadiusKm (set via profile settings, 1-200) is
// meant to cap how far they're willing to travel — Find Jobs and accepting
// a job both used to ignore it entirely and apply the same fixed global
// radius to everyone, so setting it smaller had no actual effect: a
// provider who capped themselves at 5km could still see and accept jobs
// 15km out. Falls back to the global default only when unset.
function effectiveRadiusKm(profile) {
  const r = profile?.serviceRadiusKm;
  return (typeof r === 'number' && r > 0) ? r : NEARBY_RADIUS_KM();
}

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
      const radiusKm   = effectiveRadiusKm(profile);
      const latDelta   = radiusKm / 111.0;
      const lngDelta   = radiusKm / (111.0 * Math.cos(providerLat * (Math.PI / 180)));

      // Find Jobs shows the open pool: bookings with no assigned Provider, PLUS
      // dedicated bookings that were opened to the pool (the chosen Provider declined
      // or didn't respond in time). Active dedicated requests still live only in
      // the chosen Provider's Requests inbox.
      const poolWhere = {
        status: 'REQUESTED',
        // An artist can now book as a client too, so their own request would
        // otherwise show up in their own Find Jobs list — and POST
        // /jobs/:id/accept would have happily let them accept it, since that
        // route only ever checked providerId/openToPool.
        customerId: { not: req.user.id },
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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

      // Filter out jobs this Provider has already skipped. Persisted in the DB
      // (not in-memory) so a skip survives process restarts/redeploys — see
      // BookingSkip in schema.prisma.
      const skips = await prisma.bookingSkip.findMany({
        where:  { providerId: req.user.id, bookingId: { in: bookings.map(b => b._id) } },
        select: { bookingId: true },
      });
      const skipped = new Set(skips.map(s => s.bookingId));
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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
// Skipped IDs are persisted per Provider in BookingSkip — an earlier in-memory
// Map was wiped on every restart/redeploy, silently un-skipping declined jobs.
router.post(
  '/:id/skip',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const bookingId = req.params.id;
      // Optional decline reason from the Provider (shown to the client).
      const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
      try {
        await prisma.bookingSkip.upsert({
          where:  { bookingId_providerId: { bookingId, providerId: req.user.id } },
          update: {},
          create: { bookingId, providerId: req.user.id },
        });
      } catch (skipErr) {
        // P2003 = FK violation — bookingId doesn't exist. Report 404 instead
        // of a generic 500 for this specific, expected case.
        if (skipErr.code !== 'P2003') throw skipErr;
        return res.status(404).json({ error: 'Booking not found' });
      }

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
          audience: 'CLIENT',
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
      // Refused at the accept itself, not just filtered out of the Find Jobs
      // list above: that filter is display-only, and a stale client list or a
      // direct API call would otherwise let an artist accept their own
      // booking and end up as both sides of it (same reasoning as the radius
      // check below, which had exactly this bypass).
      if (targetBooking.customerId === req.user.id) {
        return res.status(400).json({ error: 'You can’t accept your own booking.' });
      }

      if (targetBooking.providerId && targetBooking.providerId !== req.user.id && !targetBooking.openToPool) {
        return res.status(403).json({ error: 'This booking was requested for a different Provider.' });
      }

      // Open-pool jobs (no specific artist chosen, or opened to the pool after
      // the original artist didn't respond) are the ones Find Jobs lists by
      // distance — but that filter was display-only. Nothing stopped a
      // provider from accepting one outside their own configured
      // serviceRadiusKm (or the global default) via a stale client-side list
      // or a direct API call, silently ignoring the radius setting they'd
      // deliberately set. A dedicated request (client picked this specific
      // artist by name) intentionally skips this — see GET /jobs/requests'
      // own "NOT distance-filtered" comment; that's a deliberate choice
      // there, not an oversight.
      if (!targetBooking.providerId || targetBooking.openToPool) {
        if (req.user.lat && req.user.lng && targetBooking.lat && targetBooking.lng) {
          const distanceKm = haversineKm(req.user.lat, req.user.lng, targetBooking.lat, targetBooking.lng);
          const maxKm = effectiveRadiusKm(profile);
          if (distanceKm > maxKm) {
            return res.status(403).json({ error: `This job is ${Math.round(distanceKm)}km away, outside your ${maxKm}km service radius.` });
          }
        }
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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
        audience: 'CLIENT',
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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
        audience: 'CLIENT',
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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
        audience: 'CLIENT',
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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
        audience: 'CLIENT',
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
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
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

// ── GET /jobs/customer/:id/history ──────────────────────────────────────────────
// Client booking history for the "review details" screen — repeat vs first-time
// client, and how many times (if any) they've booked THIS provider before.
// Scoped to providers this client has actually requested/booked with (via the
// `booking` existence check below) — a random provider can't look up an
// arbitrary customer's history just by guessing an id.
router.get(
  '/customer/:id/history',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const hasRelationship = await prisma.booking.findFirst({
        where: { customerId: id, providerId: req.user.id },
        select: { id: true },
      });
      if (!hasRelationship) return res.status(404).json({ error: 'No booking history with this client.' });

      const [customer, totalCompletedBookings, bookingsWithMe] = await Promise.all([
        prisma.user.findUnique({ where: { id }, select: { createdAt: true } }),
        prisma.booking.count({ where: { customerId: id, status: 'COMPLETED' } }),
        prisma.booking.count({ where: { customerId: id, providerId: req.user.id, status: 'COMPLETED' } }),
      ]);
      if (!customer) return res.status(404).json({ error: 'Client not found' });

      res.json({ totalCompletedBookings, bookingsWithMe, memberSince: customer.createdAt });
    } catch (e) {
      console.error('GET /jobs/customer/:id/history error:', e);
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
        if (!name || Number.isNaN(price) || price <= 0 || price > 100000) {
          return res.status(400).json({ error: 'Each service needs a name and a price greater than $0' });
        }
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        clean.push({ name, price, durationMin: Math.min(Math.max(durationMin, 5), 720), active: s?.active !== false });
      }

      // Link to the platform catalog when the name matches (case-insensitive)
      const items = await prisma.serviceItem.findMany({ where: { active: true }, select: { id: true, name: true } });
      const itemByName = new Map(items.map(i => [i.name.toLowerCase(), i.id]));

      // specialties (ProviderProfile) is a separate, manually-set field from
      // onboarding — nothing kept it in sync with the artist's real service
      // menu afterward, so an artist who priced a new service here without
      // going back to specialties still didn't show up under it anywhere
      // that filters by specialty (category browsing, look templates, job
      // matching). The menu IS the real source of truth for what an artist
      // offers, so derive specialties from it here instead of trusting a
      // second, driftable copy.
      const specialties = [...new Set(clean.map(s => s.name))];

      const services = await prisma.$transaction(async (tx) => {
        await tx.providerService.deleteMany({ where: { profileId: profile.id } });
        for (const s of clean) {
          await tx.providerService.create({
            data: { ...s, profileId: profile.id, serviceItemId: itemByName.get(s.name.toLowerCase()) || null },
          });
        }
        await tx.providerProfile.update({ where: { id: profile.id }, data: { specialties } });
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

// ── Provider Looks — self-served, photographed/themed packages shown on the
//    public profile alongside the curated data/looks.ts catalog (see
//    ProviderLook's schema comment). ─────────────────────────────────────
const MAX_LOOK_MEDIA = 5;
const MAX_LOOK_VIDEO_BASE64 = 12_000_000; // ~9MB raw — same 6s-clip budget as posts.js

function serializeLook(l, likeCount = 0, commentCount = 0) {
  return {
    id: l.id,
    name: l.name,
    vibe: l.vibe,
    serviceType: l.serviceType,
    categories: l.categories,
    price: toNum(l.price),
    durationMin: l.durationMin,
    includes: l.includes,
    media: l.media,
    badge: l.badge,
    themeFrom: l.themeFrom,
    themeTo: l.themeTo,
    createdAt: l.createdAt,
    likeCount,
    commentCount,
  };
}

// Uploads one media item (photo, filtered through sharp; video, raw) and
// returns the { type, url } entry to store in ProviderLook.media.
// Shrinks the photo to a single pixel — sharp resamples/averages the whole
// image down to that one value, so it's a genuine (cheap) read of the
// photo's overall color, not a guess. A darkened second stop turns that one
// color into the same two-stop gradient shape every theme already uses.
async function dominantThemeFromBuffer(buf) {
  const { data } = await sharp(buf).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const from = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  const to = `#${toHex(r * 0.45)}${toHex(g * 0.45)}${toHex(b * 0.45)}`;
  return { from, to };
}

// The mobile app records video two ways: native (expo-camera's recordAsync)
// always produces real MP4/MOV, but on web (recordAsync is native-only)
// capture goes through the browser's own MediaRecorder, which only speaks
// WebM/VP9 — labeling that as video/mp4 (the old hardcoded default) uploads
// a WebM file with a .mp4 name, which then fails to play. Pick the real
// extension/content-type from whatever the client actually sent.
function videoExtAndType(mimeType) {
  if (typeof mimeType === 'string' && mimeType.startsWith('video/webm')) {
    return { ext: 'webm', contentType: 'video/webm' };
  }
  return { ext: 'mp4', contentType: 'video/mp4' };
}

async function uploadLookMedia(profileId, index, item, filter) {
  if (item.type === 'video') {
    const buf = Buffer.from(item.base64, 'base64');
    const { ext, contentType } = videoExtAndType(item.mimeType);
    const result = await uploadFile(`looks/${profileId}-${Date.now()}-${index}.${ext}`, buf, contentType);
    if (!result?.url) throw new Error('Video upload failed');
    return { type: 'video', url: result.url };
  }
  let buf = Buffer.from(item.base64, 'base64');
  let theme = null;
  try {
    theme = await dominantThemeFromBuffer(buf);
  } catch {}
  try {
    // See the note in routes/documents.js compressImage() on why .rotate()
    // must precede .resize() here.
    let img = sharp(buf).rotate().resize(1080, 1350, { fit: 'inside', withoutEnlargement: true });
    img = PHOTO_FILTERS[filter || 'original'](img);
    buf = await img.jpeg({ quality: 80 }).toBuffer();
  } catch {}
  const result = await uploadFile(`looks/${profileId}-${Date.now()}-${index}.jpg`, buf, 'image/jpeg');
  if (!result?.url) throw new Error('Photo upload failed');
  return { type: 'photo', url: result.url, theme };
}

router.get(
  '/looks',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });
      const looks = await prisma.providerLook.findMany({
        where: { profileId: profile.id, active: true },
        orderBy: { createdAt: 'desc' },
      });
      // So the artist can see which of their own looks clients respond to
      // most (surfaced as a "Most Loved" badge client-side).
      const likeCounts = await prisma.lookLike.groupBy({
        by: ['lookKey'],
        where: { profileId: profile.id, lookKey: { startsWith: 'custom:' } },
        _count: { lookKey: true },
      });
      const countByKey = Object.fromEntries(likeCounts.map(l => [l.lookKey, l._count.lookKey]));

      // Same live-count approach as likes (no denormalized column on
      // ProviderLook) — one batched groupBy for every look on this page
      // rather than N queries.
      const commentCounts = looks.length
        ? await prisma.comment.groupBy({
            by: ['providerLookId'],
            where: { providerLookId: { in: looks.map(l => l.id) } },
            _count: { providerLookId: true },
          })
        : [];
      const commentCountByLookId = Object.fromEntries(commentCounts.map(c => [c.providerLookId, c._count.providerLookId]));

      res.json({
        looks: looks.map(l => serializeLook(l, countByKey[`custom:${l.id}`] || 0, commentCountByLookId[l.id] || 0)),
      });
    } catch (err) {
      console.error('GET /provider/looks error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post(
  '/looks',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const existingCount = await prisma.providerLook.count({ where: { profileId: profile.id, active: true } });
      if (existingCount >= 24) return res.status(400).json({ error: 'You can have up to 24 looks. Remove one to add another.' });

      const { name, vibe, serviceType, categories, price, durationMin, includes, media, filter, themeFrom, themeTo, badge, autoTheme } = req.body;
      const cleanName = String(name || '').trim().slice(0, 60);
      const cleanServiceType = String(serviceType || '').trim().slice(0, 80);
      const cleanCategories = Array.isArray(categories)
        ? [...new Set(categories.filter(c => CATEGORIES.includes(c)))]
        : [];
      const cleanPrice = Number(price);
      // media: [{ type: 'photo'|'video', base64: string }] for a fresh shot, or
      // [{ type, url: string }] to reuse a photo/video already posted (the
      // artist's own post library) — same look can share media with a post,
      // and the same post can be reused across several looks. Up to
      // MAX_LOOK_MEDIA, in order — [0] becomes the cover.
      const mediaList = Array.isArray(media)
        ? media.filter(m => m && (m.type === 'photo' || m.type === 'video') && (typeof m.base64 === 'string' || typeof m.url === 'string'))
        : [];
      if (!cleanName) return res.status(400).json({ error: 'name is required' });
      if (!cleanServiceType) return res.status(400).json({ error: 'serviceType is required' });
      if (Number.isNaN(cleanPrice) || cleanPrice <= 0 || cleanPrice > 100000) {
        return res.status(400).json({ error: 'Set a price greater than $0 for this look' });
      }
      if (mediaList.length > MAX_LOOK_MEDIA) {
        return res.status(400).json({ error: `You can add up to ${MAX_LOOK_MEDIA} photos/videos per look.` });
      }
      if (mediaList.length === 0 && !(themeFrom && themeTo)) {
        return res.status(400).json({ error: 'Add at least one photo/video or pick a theme for this look' });
      }
      if (filter && !PHOTO_FILTERS[filter]) {
        return res.status(400).json({ error: `filter must be one of: ${Object.keys(PHOTO_FILTERS).join(', ')}` });
      }
      // Hex only (#RGB / #RRGGBB) — themeFrom/themeTo feed straight into the
      // client's gradient overlay (LookTile draws it on every card, photo or
      // not), so anything else renders as a broken/blank tint.
      const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
      const hasTheme = !!(themeFrom && themeTo);
      if (hasTheme && (!HEX.test(themeFrom) || !HEX.test(themeTo))) {
        return res.status(400).json({ error: 'themeFrom/themeTo must be hex colors like #A34D63' });
      }
      for (const m of mediaList) {
        if (m.base64) {
          const cap = m.type === 'video' ? MAX_LOOK_VIDEO_BASE64 : 8_000_000;
          if (m.base64.length > cap) {
            return res.status(413).json({ error: m.type === 'video' ? 'Each video must be under ~9 MB (6s clip).' : 'Each photo must be under 6 MB.' });
          }
        }
      }

      const data = {
        profileId: profile.id,
        name: cleanName,
        vibe: vibe ? String(vibe).trim().slice(0, 140) : null,
        serviceType: cleanServiceType,
        categories: cleanCategories,
        price: cleanPrice,
        durationMin: durationMin != null ? Math.min(Math.max(Number(durationMin) || 60, 5), 720) : null,
        includes: Array.isArray(includes) ? includes.filter(i => typeof i === 'string' && i.trim()).map(i => i.trim().slice(0, 60)).slice(0, 10) : [],
        badge: badge ? String(badge).trim().slice(0, 24) : null,
        // A theme is a persistent style choice now — it draws as a color
        // overlay on top of whatever media the card has, not just a
        // fallback for when there's no photo. Store it whenever given.
        themeFrom: hasTheme ? String(themeFrom).slice(0, 9) : null,
        themeTo: hasTheme ? String(themeTo).slice(0, 9) : null,
        media: [],
      };

      let extractedTheme = null;
      if (mediaList.length > 0) {
        const items = [];
        for (let i = 0; i < mediaList.length; i++) {
          const m = mediaList[i];
          if (m.url) {
            // Reusing an existing post/look photo — no upload needed.
            items.push({ type: m.type, url: String(m.url) });
            continue;
          }
          if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
          }
          try {
            // Same filter applied across freshly-shot items — a look is one
            // consistent visual moment. Reused media keeps whatever look it
            // already had as a post.
            const uploaded = await uploadLookMedia(profile.id, i, m, filter);
            if (uploaded.theme && !extractedTheme) extractedTheme = uploaded.theme; // cover photo's colors
            items.push({ type: uploaded.type, url: uploaded.url });
          } catch {
            return res.status(500).json({ error: 'Upload failed. Please try again.' });
          }
        }
        data.media = items;
      }
      // "Auto" theme — sampled from the cover photo itself rather than a
      // hand-picked preset, so the card's tint always matches what's in it.
      if (autoTheme && extractedTheme) {
        data.themeFrom = extractedTheme.from;
        data.themeTo = extractedTheme.to;
      }

      const look = await prisma.providerLook.create({ data });
      cacheFlushPattern('providers:*').catch(() => {});
      res.status(201).json({ look: serializeLook(look) });
    } catch (err) {
      console.error('POST /provider/looks error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// POST /looks/:id/photos — the "post into a look instead of the feed" path
// from PostsScreen's create flow. Appends one photo to an existing look's
// gallery rather than creating a Post record.
router.post(
  '/looks/:id/photos',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const look = await prisma.providerLook.findUnique({ where: { id: req.params.id } });
      if (!look || !look.active) return res.status(404).json({ error: 'Look not found' });
      if (look.profileId !== profile.id) return res.status(403).json({ error: 'Not your look' });
      if (look.media.length >= MAX_LOOK_MEDIA) {
        return res.status(400).json({ error: `This look already has ${MAX_LOOK_MEDIA} photos/videos — remove one first.` });
      }

      const { photoBase64, videoBase64, videoMimeType, existingUrl, existingType, filter, autoTheme } = req.body;
      const providedCount = [photoBase64, videoBase64, existingUrl].filter(Boolean).length;
      if (providedCount === 0) return res.status(400).json({ error: 'photoBase64, videoBase64, or existingUrl is required' });
      if (providedCount > 1) return res.status(400).json({ error: 'One item at a time' });
      if (photoBase64 && photoBase64.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });
      if (videoBase64 && videoBase64.length > MAX_LOOK_VIDEO_BASE64) return res.status(413).json({ error: 'Video too large. Maximum ~9 MB (6s clip).' });
      if (existingUrl && existingType !== 'photo' && existingType !== 'video') {
        return res.status(400).json({ error: "existingType must be 'photo' or 'video'" });
      }
      if (filter && !PHOTO_FILTERS[filter]) {
        return res.status(400).json({ error: `filter must be one of: ${Object.keys(PHOTO_FILTERS).join(', ')}` });
      }

      let entry;
      let extractedTheme = null;
      if (existingUrl) {
        // Reusing a photo/video already posted (this artist's own library) —
        // just reference it, no upload.
        entry = { type: existingType, url: String(existingUrl) };
      } else {
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
        }
        try {
          const uploaded = videoBase64
            ? await uploadLookMedia(profile.id, look.media.length, { type: 'video', base64: videoBase64, mimeType: videoMimeType })
            : await uploadLookMedia(profile.id, look.media.length, { type: 'photo', base64: photoBase64 }, filter);
          extractedTheme = uploaded.theme || null;
          entry = { type: uploaded.type, url: uploaded.url };
        } catch {
          return res.status(500).json({ error: 'Upload failed. Please try again.' });
        }
      }

      const updateData = { media: [...look.media, entry] };
      if (autoTheme && extractedTheme) {
        updateData.themeFrom = extractedTheme.from;
        updateData.themeTo = extractedTheme.to;
      }
      const updated = await prisma.providerLook.update({
        where: { id: look.id },
        data: updateData,
      });
      cacheFlushPattern('providers:*').catch(() => {});
      res.status(201).json({ look: serializeLook(updated) });
    } catch (err) {
      console.error('POST /provider/looks/:id/photos error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// DELETE /looks/:id/media/:index — removes one item from the gallery (an
// artist curating what's already up, distinct from adding more via the
// /photos route above). Deleting the last item leaves media empty — the
// card falls back to its theme, matching the "add at least one or pick a
// theme" rule the create route enforces.
router.delete(
  '/looks/:id/media/:index',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const look = await prisma.providerLook.findUnique({ where: { id: req.params.id } });
      if (!look || !look.active) return res.status(404).json({ error: 'Look not found' });
      if (look.profileId !== profile.id) return res.status(403).json({ error: 'Not your look' });

      const index = parseInt(req.params.index, 10);
      if (Number.isNaN(index) || index < 0 || index >= look.media.length) {
        return res.status(400).json({ error: 'Invalid media index' });
      }
      const nextMedia = look.media.filter((_, i) => i !== index);
      // A theme-only look never had media in the first place, so this can't
      // leave a card with neither — only reachable by emptying real media,
      // and the card already has a from/to fallback for that case.
      const updated = await prisma.providerLook.update({ where: { id: look.id }, data: { media: nextMedia } });
      cacheFlushPattern('providers:*').catch(() => {});
      res.json({ look: serializeLook(updated) });
    } catch (err) {
      console.error('DELETE /provider/looks/:id/media/:index error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// PATCH /looks/:id — edit an existing look. Text/config fields
// (name/vibe/service/price/duration/includes/badge/theme) always worked
// this way. `media`, if present, REPLACES the look's whole gallery in one
// shot — the edit sheet stages every photo/crop/reorder locally and sends
// the final array only when "Save changes" is tapped, the same one-commit
// model as creating a look, instead of each photo action hitting the
// server immediately mid-edit (which read as the look silently going
// live/changing before the artist had finished — the old /photos and
// /media/:index single-item routes below are kept for any other caller,
// but the edit sheet no longer uses them).
router.patch(
  '/looks/:id',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const look = await prisma.providerLook.findUnique({ where: { id: req.params.id } });
      if (!look || !look.active) return res.status(404).json({ error: 'Look not found' });
      if (look.profileId !== profile.id) return res.status(403).json({ error: 'Not your look' });

      const { name, vibe, serviceType, categories, price, durationMin, includes, badge, themeFrom, themeTo, media, filter, autoTheme } = req.body;
      const data = {};
      if (name !== undefined) {
        const cleanName = String(name).trim().slice(0, 60);
        if (!cleanName) return res.status(400).json({ error: 'name cannot be empty' });
        data.name = cleanName;
      }
      if (vibe !== undefined) data.vibe = vibe ? String(vibe).trim().slice(0, 140) : null;
      if (serviceType !== undefined) {
        const cleanServiceType = String(serviceType).trim().slice(0, 80);
        if (!cleanServiceType) return res.status(400).json({ error: 'serviceType cannot be empty' });
        data.serviceType = cleanServiceType;
      }
      if (categories !== undefined) {
        data.categories = Array.isArray(categories) ? [...new Set(categories.filter(c => CATEGORIES.includes(c)))] : [];
      }
      if (price !== undefined) {
        const cleanPrice = Number(price);
        if (Number.isNaN(cleanPrice) || cleanPrice <= 0 || cleanPrice > 100000) {
          return res.status(400).json({ error: 'Set a price greater than $0 for this look' });
        }
        data.price = cleanPrice;
      }
      if (durationMin !== undefined) {
        data.durationMin = durationMin != null ? Math.min(Math.max(Number(durationMin) || 60, 5), 720) : null;
      }
      if (includes !== undefined) {
        data.includes = Array.isArray(includes) ? includes.filter(i => typeof i === 'string' && i.trim()).map(i => i.trim().slice(0, 60)).slice(0, 10) : [];
      }
      if (badge !== undefined) data.badge = badge ? String(badge).trim().slice(0, 24) : null;
      // Theme only takes effect for a look with no media (media always wins
      // as the visual, same rule as creation) — still fine to store it now
      // so it's ready if all media later gets removed.
      if (themeFrom !== undefined || themeTo !== undefined) {
        const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
        const nextFrom = themeFrom !== undefined ? themeFrom : look.themeFrom;
        const nextTo = themeTo !== undefined ? themeTo : look.themeTo;
        if (nextFrom && nextTo && (!HEX.test(nextFrom) || !HEX.test(nextTo))) {
          return res.status(400).json({ error: 'themeFrom/themeTo must be hex colors like #A34D63' });
        }
        if (themeFrom !== undefined) data.themeFrom = themeFrom ? String(themeFrom).slice(0, 9) : null;
        if (themeTo !== undefined) data.themeTo = themeTo ? String(themeTo).slice(0, 9) : null;
      }

      if (media !== undefined) {
        const mediaList = Array.isArray(media)
          ? media.filter(m => m && (m.type === 'photo' || m.type === 'video') && (typeof m.base64 === 'string' || typeof m.url === 'string'))
          : [];
        if (mediaList.length > MAX_LOOK_MEDIA) {
          return res.status(400).json({ error: `You can add up to ${MAX_LOOK_MEDIA} photos/videos per look.` });
        }
        const nextFrom = themeFrom !== undefined ? themeFrom : look.themeFrom;
        const nextTo = themeTo !== undefined ? themeTo : look.themeTo;
        if (mediaList.length === 0 && !(nextFrom && nextTo)) {
          return res.status(400).json({ error: 'Add at least one photo/video or pick a theme for this look' });
        }
        if (filter && !PHOTO_FILTERS[filter]) {
          return res.status(400).json({ error: `filter must be one of: ${Object.keys(PHOTO_FILTERS).join(', ')}` });
        }
        for (const m of mediaList) {
          if (m.base64) {
            const cap = m.type === 'video' ? MAX_LOOK_VIDEO_BASE64 : 8_000_000;
            if (m.base64.length > cap) {
              return res.status(413).json({ error: m.type === 'video' ? 'Each video must be under ~9 MB (6s clip).' : 'Each photo must be under 6 MB.' });
            }
          }
        }

        let extractedTheme = null;
        const items = [];
        for (let i = 0; i < mediaList.length; i++) {
          const m = mediaList[i];
          if (m.url) {
            // Already-uploaded item (kept as-is from the previous gallery, or
            // reused from the artist's post library) — no re-upload needed.
            items.push({ type: m.type, url: String(m.url) });
            continue;
          }
          if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
          }
          try {
            const uploaded = await uploadLookMedia(profile.id, i, m, filter);
            if (uploaded.theme && !extractedTheme) extractedTheme = uploaded.theme;
            items.push({ type: uploaded.type, url: uploaded.url });
          } catch {
            return res.status(500).json({ error: 'Upload failed. Please try again.' });
          }
        }
        data.media = items;
        if (autoTheme && extractedTheme) {
          data.themeFrom = extractedTheme.from;
          data.themeTo = extractedTheme.to;
        }
      }

      const updated = await prisma.providerLook.update({ where: { id: look.id }, data });
      cacheFlushPattern('providers:*').catch(() => {});
      res.json({ look: serializeLook(updated) });
    } catch (err) {
      console.error('PATCH /provider/looks/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete(
  '/looks/:id',
  authenticate,
  requireRole('Provider'),
  async (req, res) => {
    try {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!profile) return res.status(403).json({ error: 'Provider profile not found.' });

      const look = await prisma.providerLook.findUnique({ where: { id: req.params.id } });
      if (!look || !look.active) return res.status(404).json({ error: 'Look not found' });
      if (look.profileId !== profile.id) return res.status(403).json({ error: 'Not your look' });

      await prisma.providerLook.update({ where: { id: look.id }, data: { active: false } });
      cacheFlushPattern('providers:*').catch(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /provider/looks/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
