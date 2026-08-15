// src/routes/customer.js
'use strict';

const express  = require('express');
const { body } = require('express-validator');
const prisma   = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const validate  = require('../middleware/validate');
const { sendPush, pushTo } = require('../utils/push');
const { notify } = require('../utils/notify');
const { cacheGet, cacheSet, cacheDel, cacheFlushPattern } = require('../utils/cache');
const { uploadFile, deleteFile } = require('../utils/storage');
const sharp = require('sharp');

// Name sanitization
const { sanitizeName } = require('../utils/sanitize');

const VALID_SERVICE_TYPES = [
  'Makeup',
  'Bridal Makeup',
  'Party Makeup',
  'Threading',
  'Hair Styling',
  'Hair Coloring',
  'Facial',
  'Waxing',
  'Nails',
  'Mehendi',
  'Massage',
];

const router = express.Router();

const { priceForBooking, computeFees } = require('../utils/pricing');
const { resolveBookingServices, resolveProviderLookBooking } = require('../utils/bookingServices');

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Service-region default — used ONLY as a last-resort map centre when neither the
// user nor a Provider has shared real GPS. Fully env-driven per deployment (set
// DEFAULT_REGION_LAT/LNG for your launch city on Railway) — no city is hardcoded
// here. Falls back to 0,0 (null island) if unset, which is intentionally useless
// as a map centre so a missing env var is obvious rather than silently pointing
// at some other product's city. NEVER used to fabricate a distance.
const REGION_LAT = parseFloat(process.env.DEFAULT_REGION_LAT) || 0;
const REGION_LNG = parseFloat(process.env.DEFAULT_REGION_LNG) || 0;
// True only when a stored coordinate pair is real (not the 0/null "unknown" sentinel).
const hasRealCoords = (lat, lng) => lat != null && lng != null && (lat !== 0 || lng !== 0);

// Picks the single nearest available, approved artist qualified for this
// service (mirrors notifyNearbyProviders' qualification logic: exact look
// match beats specialty match, both beat "nobody qualifies, pick nearest
// anyone" so an on-demand request never comes up empty just because no one
// has filled in their specialties yet). Used by POST /bookings' autoMatch
// path — see the comment there for why this exists.
async function findNearestQualifiedProvider(serviceType, lookId, lat, lng) {
  if (!hasRealCoords(lat, lng)) return null;
  const radiusKm = parseFloat(process.env.NEARBY_RADIUS_KM) || 15;

  const profiles = await prisma.providerProfile.findMany({
    where: { approvedByAdmin: true, availability: true },
    select: { userId: true, specialties: true, capableLooks: true },
  });
  if (!profiles.length) return null;

  const capability = new Map(profiles.map(p => [p.userId, p]));
  const providerUsers = await prisma.user.findMany({
    where: { id: { in: profiles.map(p => p.userId) }, role: 'Provider' },
    select: { id: true, lat: true, lng: true },
  });

  const nearby = providerUsers
    .map(u => ({ ...u, distanceKm: haversineKm(u.lat, u.lng, lat, lng) }))
    .filter(u => hasRealCoords(u.lat, u.lng) && u.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (!nearby.length) return null;

  const isQualified = (userId) => {
    const p = capability.get(userId);
    if (!p) return false;
    if (lookId && p.capableLooks.includes(lookId)) return true;
    return p.specialties.includes(serviceType);
  };
  return nearby.find(u => isQualified(u.id)) ?? nearby[0];
}

// ── Expo push notification helper ─────────────────────────────────────────────
async function notifyNearbyProviders(booking, lat, lng, io) {
  const radiusKm = parseFloat(process.env.NEARBY_RADIUS_KM) || 15;

  const profiles = await prisma.providerProfile.findMany({
    where: { approvedByAdmin: true, availability: true },
    select: { userId: true, specialties: true, capableLooks: true },
  });
  if (!profiles.length) return;

  const capability = new Map(profiles.map(p => [p.userId, p]));
  const userIds = profiles.map(p => p.userId);

  const providerUsers = await prisma.user.findMany({
    where: {
      id:            { in: userIds },
      role:          'Provider',
      expoPushToken: { not: '' },
    },
    select: { id: true, lat: true, lng: true, expoPushToken: true },
  });

  const nearby = providerUsers
    .map(u => ({ ...u, distanceKm: haversineKm(u.lat, u.lng, lat, lng) }))
    .filter(u => {
      if (u.lat === 0 && u.lng === 0) return false;
      return u.distanceKm <= radiusKm;
    });

  if (!nearby.length) return;

  // Prefer providers who specifically confirmed they can do this — the exact
  // look (ProviderProfile.capableLooks) OR just the service type
  // (specialties), whichever matches. Both are checked even when a lookId is
  // present (not lookId-match-only): capableLooks is a brand new, opt-in
  // field almost nobody has filled in yet, so requiring it exclusively would
  // collapse "qualified" to near-empty for most look-based bookings and
  // defeat the specialty-matched providers this is meant to prefer. Falls
  // back to notifying everyone nearby (the old, unfiltered behavior) when
  // NOBODY qualifies by either signal, so a new or niche look never silently
  // fails to reach anyone — this narrows the pool when it helps, it never
  // shrinks it to zero.
  const isQualified = (userId) => {
    const p = capability.get(userId);
    if (!p) return false;
    if (booking.lookId && p.capableLooks.includes(booking.lookId)) return true;
    return p.specialties.includes(booking.serviceType);
  };
  const qualified = nearby.filter(u => isQualified(u.id));
  const toNotify = qualified.length > 0 ? qualified : nearby;

  // Open-pool booking — price isn't set yet (it's resolved to each artist's own
  // rate only when they accept), so the broadcast can't quote a dollar amount here.
  // Distance IS known per-provider though, so lead with that instead of a bare
  // service/duration line.
  const messages = toNotify.map(u => ({
    to:   u.expoPushToken,
    title: `New job · ${u.distanceKm.toFixed(1)} km away`,
    body:  `${booking.serviceType} · ${booking.hours}h · ${booking.address || 'Your area'}`,
    data:  { bookingId: booking.id, type: 'job' },
    channelId: 'jobs',
  }));

  if (io) {
    for (const u of toNotify) {
      io.to(`user-${u.id}`).emit('new-job-nearby', {
        bookingId:   booking.id,
        serviceType: booking.serviceType,
        hours:       booking.hours,
        totalPrice:  toNum(booking.price),
        address:     booking.address || 'Your area',
      });
    }
  }

  for (let i = 0; i < messages.length; i += 100) {
    await sendPush(messages.slice(i, i + 100));
  }
}

// Helper: format booking for API response (mirrors Mongoose toJSON transform)
// Prisma returns Decimal objects for money fields — coerce to JS numbers for JSON.
function toNum(v) { return v == null ? v : parseFloat(v.toString()); }

function formatBooking(b) {
  if (!b) return b;
  const { price, id, customer, provider, services, ...rest } = b;
  return {
    ...rest,
    _id:          id,
    totalPrice:   toNum(price),
    platformFee:  toNum(rest.platformFee),
    providerPayout:    toNum(rest.providerPayout),
    tipAmount:    toNum(rest.tipAmount),
    ratingValue:  toNum(rest.ratingValue),
    providerRatingValue: toNum(rest.providerRatingValue),
    // Itemized line items. Absent (undefined) on responses whose query didn't
    // include them — callers must treat `services` as optional and fall back
    // to the `serviceType` summary string, which is always present.
    services:     services ? services.map(s => ({
      _id:           s.id,
      serviceItemId: s.serviceItemId ?? null,
      name:          s.name,
      price:         toNum(s.price),
      durationMin:   s.durationMin,
    })) : undefined,
    customer:     customer ? { ...customer, _id: customer.id, rating: toNum(customer.rating) } : undefined,
    provider:          provider      ? { ...provider,      _id: provider.id,      rating: toNum(provider.rating)      } : undefined,
  };
}

// ── GET /providers/available ────────────────────────────────────────────────────────
router.get(
  '/providers/available',
  authenticate,
  requireRole('CUSTOMER'),
  async (req, res) => {
    try {
      const cacheKey = 'providers:available';
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const profiles = await prisma.providerProfile.findMany({
        // Only APPROVED + available Providers are bookable — never surface unverified ones.
        where: { availability: true, approvedByAdmin: true },
        // Explicit select — exclude submittedDocuments (base64 blob JSON).
        select: {
          qualificationType: true, experienceYears: true, specialties: true, bio: true,
          licenseNumber: true, collegeName: true,
          policeCheckCleared: true, firstAidCertified: true, approvedByAdmin: true, photoUrl: true,
          availability: true,
          homeService: true, salonService: true, salonAddress: true, serviceRadiusKm: true, coverPhotoUrl: true,
          pricingModel: true, hourlyRate: true, priceNegotiable: true, capableLooks: true,
          services: { where: { active: true }, select: { name: true, price: true, durationMin: true } },
          user: {
            select: { id: true, name: true, rating: true, ratingCount: true, lat: true, lng: true, photoUrl: true, role: true, lastSeenAt: true },
          },
        },
      });

      const result = profiles
        .filter(p => p.user && p.user.role === 'Provider')
        .map(p => {
          const hasLocation = hasRealCoords(p.user.lat, p.user.lng);
          // Admin approval = identity + police + first-aid verified out-of-band, so an
          // approved Provider reads as cleared even if the granular booleans weren't toggled.
          const cleared = p.approvedByAdmin;
          return {
            _id:                p.user.id,
            name:               p.user.name,
            // toNum: Prisma Decimal serializes to a JSON string ("4.50") — the
            // app calls rating.toFixed() and hard-crashes on a string.
            rating:             toNum(p.user.rating) ?? 0,
            ratingCount:        p.user.ratingCount,
            // Real coords if shared, else the region centre purely so the map has a
            // place to put the pin — distance is computed elsewhere only from real data.
            lat:                hasLocation ? p.user.lat : REGION_LAT,
            lng:                hasLocation ? p.user.lng : REGION_LNG,
            qualificationType:  p.qualificationType,
            photoUrl:           p.user.photoUrl || p.photoUrl || '',
            experienceYears:    p.experienceYears,
            specialties:        p.specialties,
            bio:                p.bio,
            collegeName:        p.collegeName || '',
            licenseNumber:      p.licenseNumber || '',
            approvedByAdmin:    p.approvedByAdmin,
            policeCheckCleared: p.policeCheckCleared || cleared,
            firstAidCertified:  p.firstAidCertified || cleared,
            // `available` = Provider has the availability toggle on. `online` = also seen
            // recently (location/profile updated in the last 10 min) so the client's
            // green "online now" dot reflects reality instead of being always-on.
            available:          p.availability,
            homeService:        p.homeService,
            salonService:       p.salonService,
            salonAddress:       p.salonAddress || '',
            serviceRadiusKm:    p.serviceRadiusKm,
            coverPhotoUrl:      p.coverPhotoUrl || '',
            services:           (p.services || []).map(s => ({ name: s.name, price: toNum(s.price), durationMin: s.durationMin })),
            pricingModel:       p.pricingModel || 'HOURLY',
            hourlyRate:         toNum(p.hourlyRate),
            priceNegotiable:    p.priceNegotiable || false,
            capableLooks:       p.capableLooks || [],
            hasLocation,
            online:             p.availability && p.user.lastSeenAt != null && (Date.now() - new Date(p.user.lastSeenAt).getTime() < 10 * 60 * 1000),
          };
        });

      const response = { count: result.length, providers: result };
      await cacheSet(cacheKey, response, 30);
      return res.json(response);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /bookings ─────────────────────────────────────────────────────────────
router.post(
  '/bookings',
  authenticate,
  requireRole('CUSTOMER'),
  [
    // `services[]` is the current shape (multi-service). `serviceType`+`hours`
    // is the legacy single-service shape, still accepted so an app build in
    // the wild that hasn't updated yet keeps booking. Exactly one of the two
    // must be present — enforced in the handler, since express-validator
    // can't express "either/or" cleanly across two field names.
    body('services').optional().isArray({ min: 1, max: 10 }).withMessage('services must be an array of 1 to 10 items'),
    body('services.*.name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('each service needs a name of 100 characters or fewer'),
    body('services.*.serviceItemId').optional({ nullable: true }).isString().withMessage('serviceItemId must be a string'),
    // Not restricted to VALID_SERVICE_TYPES: that hardcoded list predates the
    // ProviderService catalog and would reject legitimate artist-menu names
    // (e.g. "Knotless Braids") sent by a legacy single-service client. The
    // real source of truth is the artist's own menu, checked downstream by
    // resolveBookingServices for a dedicated booking, or accepted verbatim
    // for an open-pool booking where there's no menu to check against yet.
    body('serviceType').optional().trim().isLength({ min: 1, max: 100 }).withMessage('serviceType must be 1 to 100 characters'),
    body('hours').optional().isInt({ min: 1, max: 12 }).withMessage('hours must be a whole number between 1 and 12'),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('notes must be 500 characters or fewer'),
    body('address').optional().trim().isLength({ max: 300 }).withMessage('address must be 300 characters or fewer'),
    body('recipientName').optional().trim().isLength({ max: 100 }).withMessage('recipientName must be 100 characters or fewer'),
    body('urgency').optional().isIn(['routine', 'urgent', 'emergency']).withMessage('urgency must be routine, urgent, or emergency'),
    body('scheduledAt').isISO8601().withMessage('scheduledAt must be a valid ISO 8601 date'),
    body('lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }).withMessage('lat must be a valid latitude'),
    body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).withMessage('lng must be a valid longitude'),
    // Not validated against data/looks.ts (that catalog lives in the mobile
    // app, not the backend) — just capped like any other free-form ID input.
    body('lookId').optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage('lookId must be 100 characters or fewer'),
    // A real ProviderLook row — validated ownership happens in
    // resolveProviderLookBooking, since express-validator can't reach the DB.
    body('providerLookId').optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage('providerLookId must be 100 characters or fewer'),
  ],
  validate,
  async (req, res) => {
    try {
      if (!req.user.phoneVerified) {
        return res.status(403).json({ error: 'PHONE_NOT_VERIFIED' });
      }
      const { serviceType, hours, scheduledAt, notes, providerId, proposedPrice, providerLookId } = req.body;

      // Normalise both request shapes into ONE list. Multi-service is the
      // current shape; a bare serviceType+hours is the legacy single-service
      // shape from older app builds. Downstream there is a single code path.
      const requestedServices = Array.isArray(req.body.services) && req.body.services.length
        ? req.body.services
        : (serviceType ? [{ name: serviceType }] : []);
      if (!requestedServices.length) {
        return res.status(400).json({ error: 'Select at least one service.' });
      }

      const scheduledDate = new Date(scheduledAt);
      const now = new Date();
      if (scheduledDate <= now) {
        return res.status(400).json({ error: 'scheduledAt must be a future date' });
      }
      const maxDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      if (scheduledDate > maxDate) {
        return res.status(400).json({ error: 'scheduledAt must be within one year from now' });
      }

      // Validate providerId if provided (now a cuid string, not ObjectId)
      let resolvedProviderId = null;
      if (providerId) {
        if (typeof providerId !== 'string' || !/^c[a-z0-9]{20,}$/.test(providerId)) {
          return res.status(400).json({ error: 'Invalid providerId' });
        }
        // Only an admin-approved Provider can be requested directly. Prevents booking
        // (and the job flash/notification) reaching an unverified Provider.
        const reqProfile = await prisma.providerProfile.findUnique({
          where:  { userId: providerId },
          select: { approvedByAdmin: true },
        });
        if (!reqProfile?.approvedByAdmin) {
          return res.status(400).json({ error: 'That Provider is not available for booking yet.' });
        }
        resolvedProviderId = providerId;
      }

      let latCoord = Number(req.body.lat);
      let lngCoord = Number(req.body.lng);
      // If the client didn't send coords, fall back to the customer's own stored
      // location (their real GPS) — NOT a hardcoded Sudbury point. This keeps the
      // booking's location real so Providers see an accurate distance to the client.
      if (Number.isNaN(latCoord) || Number.isNaN(lngCoord)) {
        const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { lat: true, lng: true } });
        // booking.lat/lng are non-nullable (default 0 = "unknown"). Use the
        // customer's stored coords if real, else 0 — never null (prisma rejects it).
        latCoord = (me?.lat && me.lat !== 0) ? me.lat : 0;
        lngCoord = (me?.lng && me.lng !== 0) ? me.lng : 0;
      }

      // On-demand ("book now") requests used to behave exactly like a
      // scheduled booking minus the date picker — the customer still had to
      // browse and pick a specific artist themselves, then wait for them (or
      // the open pool) to accept. autoMatch skips that: the system finds the
      // nearest available, qualified artist itself and books them directly,
      // same as if the customer had picked that artist by hand — including
      // their own price, and the existing request-timeout-sweep fallback if
      // they don't respond in time.
      if (req.body.autoMatch && !resolvedProviderId) {
        const match = await findNearestQualifiedProvider(
          requestedServices[0]?.name ?? serviceType,
          providerLookId,
          latCoord,
          lngCoord,
        );
        if (!match) {
          return res.status(404).json({ error: 'No available artists nearby right now. Try browsing artists instead.' });
        }
        resolvedProviderId = match.id;
      }

      // A ProviderLook belongs to exactly one artist — there's no "open pool"
      // version of "book this specific package," so require a chosen provider
      // up front rather than letting resolveProviderLookBooking's ownership
      // check reject it later with a less obvious error.
      if (providerLookId && !resolvedProviderId) {
        return res.status(400).json({ error: 'Choose an artist to book this look with.' });
      }

      // Dedicated booking: resolve EVERY selected service against this artist's
      // own ProviderService menu, then price the bundle. Open-pool booking (no
      // artist chosen): there is no menu to resolve against, so we fall back to
      // the legacy single-service path and price stays null until an artist
      // accepts — see POST /jobs/:id/accept.
      let serviceLines;          // BookingService rows to write, always >= 1
      let summaryServiceType;    // denormalized Booking.serviceType
      let summaryHours;          // denormalized Booking.hours
      let price;                 // denormalized Booking.price (negotiated total or listed total)

      if (resolvedProviderId) {
        const resolved = providerLookId
          ? await resolveProviderLookBooking(providerLookId, resolvedProviderId)
          : await resolveBookingServices(requestedServices, resolvedProviderId);
        serviceLines       = resolved.lines;
        summaryServiceType = resolved.summaryServiceType;
        summaryHours       = resolved.summaryHours;

        // Negotiation applies to the TOTAL only, never per line item. Same rule
        // as priceForBooking: >= 50% of listed is accepted (including above
        // listed — Glow does not cap the artist's price either way); the floor
        // is only noise reduction against accidental junk offers.
        price = resolved.listedTotal;
        if (proposedPrice != null) {
          const negotiable = await prisma.providerProfile.findUnique({
            where:  { userId: resolvedProviderId },
            select: { priceNegotiable: true },
          });
          const proposed = Number(proposedPrice);
          if (negotiable?.priceNegotiable && !isNaN(proposed) && proposed > 0 && proposed >= resolved.listedTotal * 0.5) {
            price = Math.round(proposed * 100) / 100;
          }
        }
      } else {
        // Open pool: no artist, so no real menu and no real price yet. Record
        // the request verbatim as a single line item with a zero price so the
        // itemized UI has something to render; the accepting artist's own
        // prices overwrite the summary at accept time.
        const legacyName  = requestedServices[0].name;
        const legacyHours = Number(hours) > 0 ? Number(hours) : 1;
        serviceLines       = [{ serviceItemId: null, name: legacyName, price: 0, durationMin: legacyHours * 60 }];
        summaryServiceType = legacyName;
        summaryHours       = legacyHours;
        price              = await priceForBooking(legacyName, legacyHours, null, proposedPrice); // returns null for open pool
      }

      const { platformFee, providerPayout } = price != null ? computeFees(price) : { platformFee: 0, providerPayout: 0 };

      // Nested create = ONE statement, so the Booking and its line items are
      // written atomically by Postgres. No separate transaction wrapper is
      // needed and there is no window where a Booking exists with zero
      // BookingService rows.
      const booking = await prisma.booking.create({
        data: {
          customerId:        req.user.id,
          serviceType:       summaryServiceType,
          lookId:            req.body.lookId || null,
          providerLookId:    providerLookId || null,
          hours:             summaryHours,
          scheduledAt:       scheduledDate,
          lat:               latCoord,
          lng:               lngCoord,
          address:           req.body.address?.trim() || '',
          recipientName: req.body.recipientName?.trim() || '',
          urgency:           req.body.urgency || 'routine',
          price,
          platformFee,
          providerPayout,
          notes:             notes || '',
          paymentStatus:     'PENDING',
          providerId:             resolvedProviderId,
          status:            'REQUESTED',
          // Dedicated request → stamp the time so the timeout sweep can open it to
          // the pool if the Provider doesn't respond. Open-pool bookings (no chosen Provider)
          // are already visible to everyone, so no stamp / openToPool=true.
          providerRequestedAt:    resolvedProviderId ? new Date() : null,
          openToPool:        resolvedProviderId ? false : true,
          services: { create: serviceLines },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, rating: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, rating: true, photoUrl: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
        },
      });

      cacheFlushPattern(`bookings:my:${req.user.id}*`).catch(() => {});
      cacheFlushPattern('providers:available*').catch(() => {});
      cacheFlushPattern('providers:nearby:*').catch(() => {});

      const io = req.app.get('io');
      if (io) {
        io.to(`user-${req.user.id}`).emit('booking-created', { bookingId: booking.id });
        io.to('admin-room').emit('admin-event', {
          type: 'booking',
          text: `New ${booking.serviceType} booking from ${req.user.name}`,
          time: new Date(),
        });
      }

      // Persist the customer's "Booking confirmed" so it stays in their history.
      // No phone push here — they're actively in the app creating it.
      notify({
        userId: req.user.id,
        type: 'booking',
        title: 'Booking confirmed',
        body: 'Your booking request was created.',
        bookingId: booking.id,
        push: false,
      }).catch(() => {});

      if (resolvedProviderId) {
        if (io) {
          io.to(`user-${resolvedProviderId}`).emit('new-job-assigned', {
            bookingId:   booking.id,
            serviceType: booking.serviceType,
            totalPrice:  booking.price,
            hours:       booking.hours,
            address:     booking.address || 'Your area',
          });
        }
        notify({
          userId: resolvedProviderId,
          type: 'request',
          title: `New booking assigned — $${booking.price}`,
          body: `${booking.serviceType} · ${booking.hours}h · ${booking.address || 'Your area'}`,
          bookingId: booking.id,
          channelId: 'requests',
        }).catch(() => {});
        cacheFlushPattern(`bookings:my:${resolvedProviderId}*`).catch(() => {});
      } else {
        notifyNearbyProviders(booking, latCoord, lngCoord, io).catch(() => {});
      }

      res.status(201).json({ booking: formatBooking(booking) });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /providers/nearby ──────────────────────────────────────────────────────────
router.get(
  '/providers/nearby',
  authenticate,
  requireRole('CUSTOMER', 'SALON'),
  async (req, res) => {
    try {
      // Use the customer's real query coords; fall back to the region centre only
      // when none were sent. parseFloat(...) ?? guards against a valid 0 being
      // swallowed by ||.
      const qLat     = parseFloat(req.query.lat);
      const qLng     = parseFloat(req.query.lng);
      const lat      = Number.isNaN(qLat) ? REGION_LAT : qLat;
      const lng      = Number.isNaN(qLng) ? REGION_LNG : qLng;
      const radiusKm = parseFloat(process.env.NEARBY_RADIUS_KM) || 15;

      const gridLat  = Math.round(lat * 100) / 100;
      const gridLng  = Math.round(lng * 100) / 100;
      const cacheKey = `providers:nearby:${gridLat}:${gridLng}`;
      const cached   = await cacheGet(cacheKey);
      if (cached) return res.json(cached);

      // Bounding-box pre-filter on User.lat/lng before joining ProviderProfile.
      // 1° lat ≈ 111km; 1° lng ≈ 111km * cos(lat). Pre-filter cuts the join to ~radius².
      const latDelta = radiusKm / 111.0;
      const lngDelta = radiusKm / (111.0 * Math.cos(lat * (Math.PI / 180)));

      const profiles = await prisma.providerProfile.findMany({
        where: {
          approvedByAdmin: true,
          availability: true,
          user: {
            lat: { gte: lat - latDelta, lte: lat + latDelta },
            lng: { gte: lng - lngDelta, lte: lng + lngDelta },
          },
        },
        // Explicit select — exclude submittedDocuments (base64 blob JSON).
        select: {
          specialties: true, photoUrl: true, policeCheckCleared: true, experienceYears: true,
          pricingModel: true, hourlyRate: true, priceNegotiable: true, capableLooks: true,
          user: {
            select: { id: true, name: true, rating: true, lat: true, lng: true, photoUrl: true, lastSeenAt: true },
          },
        },
        take: 50, // hard cap after bounding-box
      });

      const rows = profiles
        .map(p => {
          // Only compute a distance when the Provider has real coords; otherwise leave it
          // null so we never show a bogus "0 km" or filter them out via NaN.
          const known = hasRealCoords(p.user.lat, p.user.lng);
          const distanceKm = known ? Math.round(haversineKm(p.user.lat, p.user.lng, lat, lng) * 10) / 10 : null;
          return {
            id:                 p.user.id,
            name:               p.user.name,
            rating:             toNum(p.user.rating) ?? 5.0,
            lat:                known ? p.user.lat : REGION_LAT,
            lng:                known ? p.user.lng : REGION_LNG,
            distanceKm,
            specialties:        p.specialties.slice(0, 2),
            photoUrl:           p.user.photoUrl || p.photoUrl || '',
            policeCheckCleared: p.policeCheckCleared,
            experienceYears:    p.experienceYears,
            pricingModel:       p.pricingModel || 'HOURLY',
            hourlyRate:         toNum(p.hourlyRate),
            priceNegotiable:    p.priceNegotiable || false,
            capableLooks:       p.capableLooks || [],
          };
        })
        // Keep Providers within radius OR those whose distance is unknown (no coords yet) —
        // better to show a real Provider without a distance than to hide them.
        .filter(r => r.distanceKm == null || r.distanceKm <= radiusKm)
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
        .slice(0, 20);

      // No fake "demo" Providers — return the real (possibly empty) list. Fabricated
      // Sudbury caregivers were misleading and broke the "0 km"/wrong-location UX.
      const nearbyResponse = { providers: rows };
      await cacheSet(cacheKey, nearbyResponse, 60);
      res.json(nearbyResponse);
    } catch (err) {
      console.error('providers/nearby error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /providers/:id/public ──────────────────────────────────────────────────────
// Public Provider profile — used by customer BookingDetail → ProviderPublicProfile screen
router.get(
  '/providers/:id/public',
  authenticate,
  requireRole('CUSTOMER', 'SALON'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const profile = await prisma.providerProfile.findFirst({
        where: {
          OR: [
            { id },
            { userId: id },
          ],
          approvedByAdmin: true,
        },
        select: {
          id: true,
          userId: true,
          qualificationType: true,
          licenseNumber: true,
          collegeName: true,
          experienceYears: true,
          specialties: true,
          bio: true,
          instagramHandle: true,
          policeCheckCleared: true,
          firstAidCertified: true,
          approvedByAdmin: true,
          photos: true,
          homeService: true,
          salonService: true,
          salonAddress: true,
          serviceRadiusKm: true,
          coverPhotoUrl: true,
          photoUrl: true,
          languages: true,
          pricingModel: true,
          hourlyRate: true,
          priceNegotiable: true,
          businessHours: true,
          capableLooks: true,
          services: { where: { active: true }, select: { name: true, price: true, durationMin: true } },
          user: {
            select: {
              id: true,
              name: true,
              photoUrl: true,
              rating: true,
              ratingCount: true,
              lat: true,
              lng: true,
            },
          },
        },
      });

      if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

      // Count completed bookings for this Provider
      const completedCount = await prisma.booking.count({
        where: { providerId: profile.userId, status: 'COMPLETED' },
      });

      // Recent ratings — from completed bookings with ratingGiven = true
      const ratedBookings = await prisma.booking.findMany({
        where: { providerId: profile.userId, status: 'COMPLETED', ratingGiven: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          ratingValue: true,
          ratingComment: true,
          updatedAt: true,
          customer: { select: { name: true, photoUrl: true } },
        },
      });

      // Most recent active posts for this Provider (portfolio grid on the public profile)
      const recentPosts = await prisma.post.findMany({
        where: { profileId: profile.id, active: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { service: { select: { id: true, name: true, price: true } } },
      });

      // Self-served looks (see ProviderLook schema comment) — rendered next to
      // the curated catalog on the "Looks X creates" section.
      const customLooks = await prisma.providerLook.findMany({
        where: { profileId: profile.id, active: true },
        orderBy: { createdAt: 'desc' },
      });

      // Like counts for every look under this artist — counted on read since
      // catalog looks (data/looks.ts, mobile-side static data) have no DB row
      // of their own to hold a denormalized counter (see LookLike comment).
      const lookLikeCounts = await prisma.lookLike.groupBy({
        by: ['lookKey'],
        where: { profileId: profile.id },
        _count: { lookKey: true },
      });
      const likeCountByKey = Object.fromEntries(lookLikeCounts.map(l => [l.lookKey, l._count.lookKey]));
      const myLikedKeys = new Set(
        (await prisma.lookLike.findMany({
          where: { profileId: profile.id, userId: req.user.id },
          select: { lookKey: true },
        })).map(l => l.lookKey)
      );

      res.json({
        provider: {
          id: profile.userId,
          profileId: profile.id,
          name: profile.user.name,
          photoUrl: profile.user.photoUrl || profile.photoUrl,
          rating: toNum(profile.user.rating) ?? 0,
          ratingCount: profile.user.ratingCount ?? 0,
          qualificationType: profile.qualificationType,
          licenseNumber: profile.licenseNumber || '',
          collegeName: profile.collegeName || '',
          experienceYears: profile.experienceYears,
          specialties: profile.specialties ?? [],
          bio: profile.bio,
          instagramHandle: profile.instagramHandle || '',
          policeCheckCleared: profile.policeCheckCleared,
          firstAidCertified: profile.firstAidCertified,
          photos: profile.photos ?? [],
          homeService: profile.homeService,
          salonService: profile.salonService,
          salonAddress: profile.salonAddress || '',
          serviceRadiusKm: profile.serviceRadiusKm,
          businessHours: profile.businessHours || {},
          // 0/0 = ungeocoded (project convention) — client omits the map when either is 0.
          lat: profile.user.lat ?? 0,
          lng: profile.user.lng ?? 0,
          coverPhotoUrl: profile.coverPhotoUrl || '',
          languages: profile.languages ?? [],
          services: (profile.services || []).map(s => ({ name: s.name, price: toNum(s.price), durationMin: s.durationMin })),
          capableLooks: profile.capableLooks ?? [],
          lookLikes: likeCountByKey,
          myLikedLookKeys: [...myLikedKeys],
          customLooks: customLooks.map(l => ({
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
            likeCount: likeCountByKey[`custom:${l.id}`] || 0,
          })),
          pricingModel: profile.pricingModel || 'HOURLY',
          hourlyRate: toNum(profile.hourlyRate),
          priceNegotiable: profile.priceNegotiable || false,
          completedBookings: completedCount,
          recentRatings: ratedBookings.map(b => ({
            id: b.id,
            rating: toNum(b.ratingValue) ?? 0,
            comment: b.ratingComment ?? '',
            customerName: b.customer?.name ? b.customer.name.split(' ')[0] + '.' : 'Anonymous',
            customerPhotoUrl: b.customer?.photoUrl || null,
            createdAt: b.updatedAt,
          })),
          posts: recentPosts.map(p => ({
            id: p.id,
            photoUrl: p.photoUrl,
            videoUrl: p.videoUrl,
            caption: p.caption,
            likeCount: p.likeCount,
            createdAt: p.createdAt,
            service: p.service ? { id: p.service.id, name: p.service.name, price: toNum(p.service.price) } : null,
          })),
        },
      });
    } catch (err) {
      console.error('GET /providers/:id/public error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// A like belongs to (this artist, this look) — the same catalog look liked
// under two different artists counts separately, since "liked" here means
// "liked THIS artist's take on Bridal Glow", not the abstract catalog entry.
function isValidLookKey(key) {
  return typeof key === 'string' && /^(catalog|custom):[a-zA-Z0-9_-]{1,60}$/.test(key);
}

router.post(
  '/providers/:id/looks/:lookKey/like',
  authenticate,
  requireRole('CUSTOMER', 'SALON'),
  async (req, res) => {
    try {
      const { id, lookKey } = req.params;
      if (!isValidLookKey(lookKey)) return res.status(400).json({ error: 'Invalid look' });
      const profile = await prisma.providerProfile.findFirst({
        where: { OR: [{ id }, { userId: id }], approvedByAdmin: true },
        select: { id: true },
      });
      if (!profile) return res.status(404).json({ error: 'Artist not found' });

      try {
        await prisma.lookLike.create({ data: { profileId: profile.id, lookKey, userId: req.user.id } });
      } catch (err) {
        if (err.code !== 'P2002') throw err; // already liked — no-op
      }
      res.json({ success: true });
    } catch (err) {
      console.error('POST /providers/:id/looks/:lookKey/like error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete(
  '/providers/:id/looks/:lookKey/like',
  authenticate,
  requireRole('CUSTOMER', 'SALON'),
  async (req, res) => {
    try {
      const { id, lookKey } = req.params;
      if (!isValidLookKey(lookKey)) return res.status(400).json({ error: 'Invalid look' });
      const profile = await prisma.providerProfile.findFirst({
        where: { OR: [{ id }, { userId: id }] },
        select: { id: true },
      });
      if (!profile) return res.status(404).json({ error: 'Artist not found' });

      await prisma.lookLike.deleteMany({ where: { profileId: profile.id, lookKey, userId: req.user.id } });
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /providers/:id/looks/:lookKey/like error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /bookings/my ──────────────────────────────────────────────────────────
router.get(
  '/bookings/my',
  authenticate,
  requireRole('CUSTOMER'),
  async (req, res) => {
    try {
      const VALID_STATUSES = ['REQUESTED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'CANCELLED'];
      const { status } = req.query;
      const where = { customerId: req.user.id };
      if (status) {
        if (!VALID_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'Invalid status value' });
        }
        where.status = status;
      }

      const cacheKey = `bookings:my:${req.user.id}${status ? `:${status}` : ''}`;
      if (!req.query.nocache) {
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);
      }

      const bookings = await prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true, rating: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, rating: true, photoUrl: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
        },
      });

      const result = { bookings: bookings.map(formatBooking) };
      await cacheSet(cacheKey, result, 5);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /bookings/:id/reassign ────────────────────────────────────────────────
// Client picks a different Provider for an existing booking (e.g. after the first one
// declined). Only works while the booking has no active Provider. Payment untouched.
router.post(
  '/bookings/:id/reassign',
  authenticate,
  requireRole('CUSTOMER'),
  async (req, res) => {
    try {
      if (!req.user.phoneVerified) {
        return res.status(403).json({ error: 'PHONE_NOT_VERIFIED' });
      }
      const bookingId = req.params.id;
      const { providerId } = req.body;
      if (!providerId || typeof providerId !== 'string' || providerId.length < 20) {
        return res.status(400).json({ error: 'A valid providerId is required.' });
      }

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.customerId !== req.user.id) {
        return res.status(404).json({ error: 'Booking not found.' });
      }
      if (!['REQUESTED'].includes(booking.status) || booking.providerId) {
        return res.status(400).json({ error: 'This booking already has a Provider or can no longer be reassigned.' });
      }

      // New Provider must be approved.
      const profile = await prisma.providerProfile.findUnique({ where: { userId: providerId }, select: { approvedByAdmin: true } });
      if (!profile?.approvedByAdmin) {
        return res.status(400).json({ error: 'That Provider is not available for booking.' });
      }

      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data:  { providerId },   // status stays REQUESTED until the new Provider accepts
      });

      // Price wasn't set at creation (open-pool booking) — it's resolved to
      // this specific Provider's own rate only when they accept, so it can't
      // be quoted in this notification yet.
      const io = req.app.get('io');
      if (io) {
        io.to(`user-${providerId}`).emit('new-job-assigned', {
          bookingId:   booking.id,
          serviceType: booking.serviceType,
          totalPrice:  booking.price,
          hours:       booking.hours,
          address:     booking.address || 'Your area',
        });
      }
      notify({
        userId: providerId,
        type: 'request',
        title: 'New booking request',
        body: `${booking.serviceType} · ${booking.hours}h · ${booking.address || 'Your area'}`,
        bookingId: booking.id,
        channelId: 'requests',
      }).catch(() => {});
      cacheFlushPattern(`bookings:my:${req.user.id}*`).catch(() => {});
      cacheFlushPattern(`bookings:my:${providerId}*`).catch(() => {});

      res.json({ booking: formatBooking(updated) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /bookings/:id/tracking ─────────────────────────────────────────────────
router.get(
  '/bookings/:id/tracking',
  authenticate,
  requireRole('CUSTOMER'),
  async (req, res) => {
    try {
      const booking = await prisma.booking.findFirst({
        where: {
          id:         req.params.id,
          customerId: req.user.id,
          // Include REQUESTED so the tracking screen works during the search /
          // declined / opened-to-pool phase (it previously 404'd until a Provider
          // accepted, so the client never saw a live "finding a caregiver" state).
          status:     { in: ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED', 'COMPLETED'] },
        },
        include: {
          provider: { select: { id: true, name: true, phone: true, rating: true, ratingCount: true, photoUrl: true } },
        },
      });

      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      const providerProfile = booking.providerId
        ? await prisma.providerProfile.findUnique({ where: { userId: booking.providerId } })
        : null;

      res.json({
        status:        booking.status,
        paymentStatus: booking.paymentStatus,
        // Surfaced so the client's "finding a Provider" UI can explain WHY it's still
        // searching: openToPool = the request was opened to more Providers nearby
        // (chosen Provider declined or didn't respond in time).
        openToPool:    booking.openToPool ?? false,
        ratingGiven:   booking.ratingGiven ?? false,
        providerLocation: (booking.providerLocationLat != null && booking.providerLocationLng != null)
          ? { lat: booking.providerLocationLat, lng: booking.providerLocationLng, updatedAt: booking.providerLocationUpdatedAt }
          : null,
        provider: booking.provider
          ? {
              _id:                booking.provider.id,
              name:               booking.provider.name,
              phone:              booking.provider.phone,
              rating:             toNum(booking.provider.rating) ?? 0,
              ratingCount:        booking.provider.ratingCount,
              photoUrl:           booking.provider.photoUrl || providerProfile?.photoUrl || null,
              experienceYears:    providerProfile?.experienceYears || 0,
              specialties:        providerProfile?.specialties || [],
              languages:          providerProfile?.languages || [],
              certifications:     providerProfile?.certifications || [],
              policeCheckCleared: providerProfile?.policeCheckCleared || false,
            }
          : null,
        booking: {
          serviceType: booking.serviceType,
          scheduledAt: booking.scheduledAt,
          hours:       booking.hours,
          totalPrice:  toNum(booking.price),
          platformFee: toNum(booking.platformFee),
          providerPayout:   toNum(booking.providerPayout),
          address:     booking.address,
        },
      });
    } catch (e) {
      console.error('GET /bookings/:id/tracking error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /bookings/:id ──────────────────────────────────────────────────────────
router.get(
  '/bookings/:id',
  authenticate,
  async (req, res) => {
    try {
      const { id } = req.params;

      // A Provider may view a booking only if it's THEIRS, or an unassigned general
      // request (providerId null). They must NOT see a REQUESTED booking dedicated to
      // another Provider. Customers may view only their own bookings.
      const where = req.user.role === 'Provider'
        ? { id, OR: [{ providerId: req.user.id }, { providerId: null, status: 'REQUESTED' }] }
        : { id, customerId: req.user.id };

      const cacheKey = `bookings:${id}:${req.user.id}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const booking = await prisma.booking.findFirst({
        where,
        include: {
          // Phone only returned to the assigned Provider — not to pool browsers.
          // skinTone/skinType were missing here (present on every other job/
          // request endpoint) — this is the one JobDetailScreen calls right
          // after mounting with the correct route-params copy, so its refetch
          // was silently clobbering a correct CLIENT PROFILE section with one
          // that always looked empty.
          customer: { select: { id: true, name: true, phone: true, skinTone: true, skinType: true, rating: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, rating: true, ratingCount: true, photoUrl: true } },
          services: { select: { id: true, serviceItemId: true, name: true, price: true, durationMin: true } },
          // "Book this look" bookings (an artist's own ProviderLook, not the
          // shared catalog) never surfaced which look was actually requested
          // anywhere the PROVIDER could see — only the catalog lookId path
          // (jobView.lookId, resolved client-side against data/looks.ts) was
          // ever checked. An artist getting a request for their own "Bridal
          // Glam" package saw a completely blank "what did they pick" gap.
          providerLook: { select: { id: true, name: true, vibe: true, media: true, includes: true } },
        },
      });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      // Redact customer phone if a Provider is browsing a pool booking (not assigned to them)
      if (req.user.role === 'Provider' && booking.providerId !== req.user.id && booking.customer) {
        booking.customer = { ...booking.customer, phone: null };
      }

      const result = { booking: formatBooking(booking) };
      const ttl = ['COMPLETED', 'CANCELLED'].includes(booking.status) ? 120 : 5;
      await cacheSet(cacheKey, result, ttl);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /ratings ──────────────────────────────────────────────────────────────
router.post(
  '/ratings',
  authenticate,
  // SALON clients book like CUSTOMERs but were blocked from rating their Provider
  // (403 → "submit rating broken"). Allow both client roles.
  requireRole('CUSTOMER', 'SALON'),
  [
    body('bookingId').notEmpty().withMessage('bookingId is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be an integer between 1 and 5'),
  ],
  validate,
  async (req, res) => {
    try {
      const { bookingId, rating } = req.body;

      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, customerId: req.user.id, status: 'COMPLETED' },
      });

      if (!booking) {
        return res.status(404).json({
          error: 'Completed booking not found. Only completed bookings can be rated.',
        });
      }

      if (booking.ratingGiven) {
        return res.status(409).json({ error: 'You have already rated this booking.' });
      }

      if (!booking.providerId) {
        return res.status(400).json({ error: 'No Provider assigned to this booking' });
      }

      // Fetch Provider once — select only what we need (avoids re-fetch below for push token)
      const provider = await prisma.user.findUnique({
        where:  { id: booking.providerId },
        select: { id: true, rating: true, ratingCount: true, expoPushToken: true },
      });
      if (!provider) return res.status(404).json({ error: 'Provider not found' });

      // Incremental rolling average
      const total        = provider.rating * provider.ratingCount + Number(rating);
      const newCount     = provider.ratingCount + 1;
      const newRating    = Math.round((total / newCount) * 10) / 10;

      await prisma.user.update({
        where: { id: provider.id },
        data:  { rating: newRating, ratingCount: newCount },
      });

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          ratingGiven:   true,
          ratingValue:   Number(rating),
          ratingComment: req.body.comment?.trim() ?? '',
        },
      });

      cacheFlushPattern(`bookings:my:${req.user.id}*`).catch(() => {});
      cacheDel(`bookings:${bookingId}:${req.user.id}`).catch(() => {});
      cacheFlushPattern('providers:available*').catch(() => {});
      cacheFlushPattern('providers:nearby:*').catch(() => {});

      const io = req.app.get('io');
      if (io) {
        io.to(`user-${booking.providerId}`).emit('provider-rated', {
          rating,
          newAverage: newRating,
          bookingId: booking.id,
        });
      }

      notify({
        userId: booking.providerId,
        type: 'rating',
        title: `You received a ${rating}-star rating!`,
        body: `Your new average is ${newRating} ★`,
        bookingId: booking.id,
        pushToken: provider.expoPushToken, // reuse token fetched above — no extra DB call
      }).catch(() => {});

      res.json({ message: 'Rating submitted', newRating });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /bookings/:id/cancel ─────────────────────────────────────────────────
router.patch(
  '/bookings/:id/cancel',
  authenticate,
  requireRole('CUSTOMER'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check booking exists and is cancellable
      const existing = await prisma.booking.findFirst({
        where: { id, customerId: req.user.id, status: { in: ['REQUESTED', 'ACCEPTED'] } },
      });

      if (!existing) {
        return res.status(404).json({
          error: 'Booking not found or cannot be cancelled once service has started.',
        });
      }

      const booking = await prisma.booking.update({
        where: { id },
        data:  { status: 'CANCELLED', paymentStatus: 'REFUNDED' },
        include: {
          provider: { select: { id: true, name: true, phone: true } },
        },
      });

      cacheFlushPattern(`bookings:my:${req.user.id}*`).catch(() => {});
      cacheDel(`bookings:${id}:${req.user.id}`).catch(() => {});

      if (booking.provider) {
        const io = req.app.get('io');
        if (io) io.to(`user-${booking.provider.id}`).emit('booking-cancelled', {
          bookingId:    booking.id,
          customerName: req.user.name,
        });
        notify({
          userId: booking.provider.id,
          type: 'cancelled',
          title: 'Booking Cancelled',
          body: `${req.user.name} has cancelled their booking.`,
          bookingId: booking.id,
        }).catch(() => {});
      }

      res.json({ message: 'Booking cancelled successfully', booking: formatBooking(booking) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /profile/documents ────────────────────────────────────────────────────
router.post(
  '/profile/documents',
  authenticate,
  async (req, res) => {
    try {
      if (req.user.role !== 'Provider') {
        return res.status(403).json({ error: 'Only Provider accounts can upload documents' });
      }

      const { docType, label, dataUrl } = req.body;
      if (!docType || !dataUrl) {
        return res.status(400).json({ error: 'docType and dataUrl are required' });
      }

      const profile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

      // submittedDocuments is stored as JSON array in Postgres
      const docs = Array.isArray(profile.submittedDocuments) ? profile.submittedDocuments : [];
      const idx = docs.findIndex(d => d.docType === docType);

      const newDoc = {
        docType, label, dataUrl,
        submittedAt: new Date().toISOString(),
        verifiedByAdmin: false,
        verifiedAt: null,
        rejectionNote: '',
      };

      if (idx >= 0) {
        docs[idx] = newDoc;
      } else {
        docs.push(newDoc);
      }

      await prisma.providerProfile.update({
        where: { userId: req.user.id },
        data:  { submittedDocuments: docs },
      });

      res.json({ message: 'Document uploaded', docType });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /profile ─────────────────────────────────────────────────────────────
// Updates User fields + (for Providers) bio / languages / specialties / photos
// on ProviderProfile. Mobile ProfileScreen saves all of these through one endpoint.
router.patch(
  '/profile',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 2, max: 80 }).withMessage('name must be 2–80 characters'),
    body('email').optional().trim().isEmail().withMessage('invalid email'),
    body('address').optional().trim().isLength({ max: 200 }).withMessage('address too long'),
    body('emergencyContact.name').optional().trim().isLength({ max: 80 }),
    body('emergencyContact.phone').optional().trim(),
    body('bio').optional().trim().isLength({ max: 600 }).withMessage('bio must be ≤ 600 characters'),
    body('languages').optional().isArray({ max: 12 }).withMessage('languages must be an array'),
    body('specialties').optional().isArray({ max: 20 }).withMessage('specialties must be an array'),
    body('photos').optional().isArray({ max: 10 }).withMessage('photos must be an array'),
    body('skinTone').optional().isIn(['FAIR', 'LIGHT', 'MEDIUM', 'TAN', 'DEEP', 'RICH']).withMessage('invalid skinTone'),
    body('skinType').optional().isIn(['DRY', 'OILY', 'COMBINATION', 'NORMAL', 'SENSITIVE']).withMessage('invalid skinType'),
    body('preferredOccasions').optional().isArray({ max: 7 }).withMessage('preferredOccasions must be an array'),
  ],
  validate,
  async (req, res) => {
    try {
      const allowed = ['name', 'email', 'address', 'emergencyContact', 'preferredLanguage', 'gender', 'photoUrl', 'skinTone', 'skinType', 'preferredOccasions'];
      const raw = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

      const VALID_OCCASIONS = ['Bridal', 'Party/Glam', 'Everyday', 'Date Night', 'Festival', 'Office', 'Threading & Brows'];
      if (raw.preferredOccasions && !raw.preferredOccasions.every(o => VALID_OCCASIONS.includes(o))) {
        return res.status(400).json({ error: 'preferredOccasions contains an invalid value' });
      }

      if (raw.name) raw.name = sanitizeName(raw.name);

      // Flatten emergencyContact to separate fields
      const data = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === 'emergencyContact' && v && typeof v === 'object') {
          if (v.name  !== undefined) data.emergencyContactName  = v.name;
          if (v.phone !== undefined) data.emergencyContactPhone = v.phone;
        } else {
          data[k] = v;
        }
      }

      // Validate photoUrl — must be https to prevent javascript:/data: injection
      if (data.photoUrl && !String(data.photoUrl).startsWith('https://')) {
        return res.status(400).json({ error: 'photoUrl must be an https URL' });
      }

      // Only touch User if there is something to write (avoids empty update errors).
      let user;
      if (Object.keys(data).length > 0) {
        user = await prisma.user.update({ where: { id: req.user.id }, data });
      } else {
        user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
      }

      // Provider-only profile fields (bio / languages / specialties / gallery / headshot)
      let providerProfile = null;
      if (req.user.role === 'Provider') {
        const providerData = {};
        if (req.body.photoUrl) providerData.photoUrl = req.body.photoUrl;
        if (typeof req.body.bio === 'string') providerData.bio = req.body.bio.trim();
        if (typeof req.body.instagramHandle === 'string') {
          // Accepts "@handle", a full instagram.com/handle URL, or a bare handle —
          // always stored as just the handle so the client builds the link itself.
          const raw = req.body.instagramHandle.trim();
          const stripped = raw
            .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
            .replace(/^@/, '')
            .replace(/\/.*$/, '');
          if (stripped && !/^[a-zA-Z0-9._]{1,30}$/.test(stripped)) {
            return res.status(400).json({ error: 'Instagram handle can only contain letters, numbers, periods and underscores.' });
          }
          providerData.instagramHandle = stripped;
        }
        if (Array.isArray(req.body.languages)) {
          providerData.languages = req.body.languages
            .filter(l => typeof l === 'string' && l.trim())
            .map(l => l.trim())
            .slice(0, 12);
        }
        if (Array.isArray(req.body.specialties)) {
          providerData.specialties = req.body.specialties
            .filter(s => typeof s === 'string' && s.trim())
            .map(s => s.trim())
            .slice(0, 20);
        }
        if (Array.isArray(req.body.photos)) {
          providerData.photos = req.body.photos
            .filter(u => typeof u === 'string' && u.startsWith('http'))
            .slice(0, 10);
        }

        // Delete any gallery photo the client dropped from the array — otherwise
        // it stays in Blob storage forever, unreferenced and still billed for.
        if (providerData.photos) {
          const existing = await prisma.providerProfile.findUnique({
            where: { userId: req.user.id },
            select: { photos: true },
          });
          const removed = (existing?.photos ?? []).filter(u => !providerData.photos.includes(u));
          for (const url of removed) {
            deleteFile(url).catch(() => {});
          }
        }
        if (Object.keys(providerData).length > 0) {
          providerProfile = await prisma.providerProfile.upsert({
            where:  { userId: req.user.id },
            update: providerData,
            create: { userId: req.user.id, ...providerData },
          });
        } else {
          providerProfile = await prisma.providerProfile.findUnique({ where: { userId: req.user.id } });
        }
      }

      const { expoPushToken: _pt, ...safeUser } = user;
      safeUser.rating = toNum(safeUser.rating) ?? 0;
      if (providerProfile) safeUser.providerProfile = providerProfile;
      res.json({ message: 'Profile updated', user: safeUser });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /providers/:id/favorite ─────────────────────────────────────────────
// Idempotent: favoriting an already-favorited provider is a no-op (upsert on the
// Favorite compound unique key), never a duplicate row or a 409.
router.post(
  '/providers/:id/favorite',
  authenticate,
  async (req, res) => {
    try {
      const providerId = req.params.id;
      const provider = await prisma.user.findUnique({ where: { id: providerId } });
      if (!provider || provider.role !== 'Provider') {
        return res.status(404).json({ error: 'Provider not found' });
      }
      await prisma.favorite.upsert({
        where: { customerId_providerId: { customerId: req.user.id, providerId } },
        update: {},
        create: { customerId: req.user.id, providerId },
      });
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── DELETE /providers/:id/favorite ───────────────────────────────────────────
// Idempotent: unfavoriting a non-favorited provider is a no-op (deleteMany
// matches zero rows rather than erroring).
router.delete(
  '/providers/:id/favorite',
  authenticate,
  async (req, res) => {
    try {
      await prisma.favorite.deleteMany({
        where: { customerId: req.user.id, providerId: req.params.id },
      });
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /favorites ────────────────────────────────────────────────────────────
// Response shape is IDENTICAL to GET /public/providers' provider-card shape
// (see src/routes/public.js) so mobile can type apiGetFavorites() as
// PublicProviderCard[] and pass results directly into <ArtistCard/> with zero
// mapping. Field list/order/null-handling must stay in lockstep with public.js.
router.get(
  '/favorites',
  authenticate,
  async (req, res) => {
    try {
      const favorites = await prisma.favorite.findMany({
        where: { customerId: req.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              photoUrl: true,
              rating: true,
              ratingCount: true,
              lat: true,
              lng: true,
              deletedAt: true,
              role: true,
              providerProfile: {
                select: {
                  qualificationType: true,
                  experienceYears: true,
                  bio: true,
                  specialties: true,
                  languages: true,
                  policeCheckCleared: true,
                  firstAidCertified: true,
                  photoUrl: true,
                  services: {
                    where: { active: true },
                    select: { id: true, name: true, price: true, active: true },
                  },
                },
              },
              _count: {
                select: { bookingsAsProvider: { where: { status: 'COMPLETED' } } },
              },
            },
          },
        },
      });

      const providers = favorites
        .filter(f => f.provider && !f.provider.deletedAt && f.provider.role === 'Provider')
        .map(f => {
          const u = f.provider;
          return {
            id: u.id,
            // Full name, NOT publicName()'s masked "First L." form — GET /favorites
            // is a private authenticated list of artists the customer already
            // knows/chose (unlike public discovery, where masking protects
            // providers from strangers browsing).
            name: u.name,
            photoUrl: u.photoUrl || u.providerProfile?.photoUrl || '',
            rating: toNum(u.rating),
            ratingCount: u.ratingCount,
            completedVisits: u._count.bookingsAsProvider,
            qualificationType: u.providerProfile?.qualificationType || 'Provider',
            experienceYears: u.providerProfile?.experienceYears || 0,
            bio: (u.providerProfile?.bio || '').slice(0, 140),
            specialties: (u.providerProfile?.specialties || []).slice(0, 4),
            languages: u.providerProfile?.languages || ['English'],
            policeCheckCleared: !!u.providerProfile?.policeCheckCleared,
            firstAidCertified: !!u.providerProfile?.firstAidCertified,
            startingPrice: (() => {
              const prices = (u.providerProfile?.services || [])
                .filter(s => s.active)
                .map(s => Number(s.price))
                .filter(p => Number.isFinite(p) && p > 0);
              return prices.length > 0 ? Math.min(...prices) : null;
            })(),
            lat: u.lat,
            lng: u.lng,
          };
        });

      res.json({ providers });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /profile/photo ────────────────────────────────────────────────────────
router.post(
  '/profile/photo',
  authenticate,
  async (req, res) => {
    try {
      const { photoBase64, mimeType = 'image/jpeg', purpose = 'avatar' } = req.body;
      if (!photoBase64) return res.status(400).json({ error: 'photoBase64 required' });
      if (photoBase64.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
      }

      // Compress to max 800×800 JPEG at 80% quality before uploading
      let buf = Buffer.from(photoBase64, 'base64');
      try {
        buf = await sharp(buf)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch {}

      const result = await uploadFile(`photos/${req.user.id}-${Date.now()}.jpg`, buf, 'image/jpeg');
      if (!result?.url) {
        return res.status(500).json({ error: 'Photo upload failed. Please try again.' });
      }
      const photoUrl = result.url;

      // Only overwrite the avatar (User.photoUrl / ProviderProfile.photoUrl) for
      // an actual avatar upload — gallery photos share this same endpoint but must
      // never clobber the profile picture. Gallery photos are appended to
      // ProviderProfile.photos separately, by the caller, via PATCH /profile.
      if (purpose !== 'gallery') {
        await prisma.user.update({ where: { id: req.user.id }, data: { photoUrl } });

        if (req.user.role === 'Provider') {
          await prisma.providerProfile.upsert({
            where:  { userId: req.user.id },
            update: { photoUrl },
            create: { userId: req.user.id, photoUrl },
          });
        }
      }

      res.json({ photoUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /profile/push-token ──────────────────────────────────────────────────
router.patch(
  '/profile/push-token',
  authenticate,
  async (req, res) => {
    try {
      const { pushToken } = req.body;
      if (!pushToken || typeof pushToken !== 'string') {
        return res.status(400).json({ error: 'pushToken is required' });
      }
      await prisma.user.update({ where: { id: req.user.id }, data: { expoPushToken: pushToken } });
      res.json({ message: 'Push token saved' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── DELETE /account ────────────────────────────────────────────────────────────
// In-app account deletion (App Store Guideline 5.1.1(v) / Google equivalent).
// Soft-deletes + anonymizes the user so legal/payment records (completed bookings,
// Provider earnings) survive, while sensitive PII (name, phone, email, photo, uploaded
// documents) is purged and the account can never log in again.
router.delete(
  '/account',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { providerProfile: { select: { id: true } } },
      });
      if (!user) return res.status(404).json({ error: 'Account not found' });
      if (user.deletedAt) return res.status(409).json({ error: 'Account already deleted' });

      // Cancel + refund any in-flight bookings so the other party isn't left hanging.
      await prisma.booking.updateMany({
        where: {
          OR: [{ customerId: userId }, { providerId: userId }],
          status: { in: ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED'] },
        },
        data: { status: 'CANCELLED', paymentStatus: 'REFUNDED' },
      });

      // Hard-delete uploaded documents (police check, ID, certificates) — sensitive
      // PII with no retention justification once the account is gone.
      if (user.providerProfile?.id) {
        await prisma.document.deleteMany({ where: { entityId: user.providerProfile.id } });
      }

      // Anonymize the user. Phone is freed (suffixed) so the real number can sign up
      // fresh; deletedAt blocks this row from ever authenticating again.
      const stamp = Date.now();
      await prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt:             new Date(),
          name:                  'Deleted User',
          phone:                 `deleted_${stamp}_${user.phone}`.slice(0, 40),
          email:                 null,
          photoUrl:              '',
          expoPushToken:         '',
          address:               null,
          emergencyContactName:  null,
          emergencyContactPhone: null,
          dateOfBirth:           null,
        },
      });

      // Scrub the Provider profile's free-text + contact details too (keep the row so
      // completed bookings still resolve a (now anonymous) provider).
      if (user.providerProfile?.id) {
        await prisma.providerProfile.update({
          where: { id: user.providerProfile.id },
          data: { bio: '', photoUrl: '', availability: false, licenseNumber: '', submittedDocuments: [] },
        }).catch(() => {});
      }

      cacheFlushPattern(`bookings:my:${userId}*`).catch(() => {});
      cacheDel(`providers:available`).catch(() => {});

      res.json({ message: 'Account deleted' });
    } catch (err) {
      console.error('DELETE /account error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /notifications ─────────────────────────────────────────────────────────
// Durable notification history for the signed-in user (any role). The app merges
// this with live socket events so the bell shows the full timeline even after the
// app was closed when an event fired.
router.get(
  '/notifications',
  authenticate,
  async (req, res) => {
    try {
      const items = await prisma.notification.findMany({
        where:   { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take:    100,
      });
      const unreadCount = items.filter(n => !n.read).length;
      res.json({ notifications: items, unreadCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /notifications/read ──────────────────────────────────────────────────
// Mark all of the user's notifications read (called when they open the bell).
router.patch(
  '/notifications/read',
  authenticate,
  async (req, res) => {
    try {
      await prisma.notification.updateMany({
        where: { userId: req.user.id, read: false },
        data:  { read: true },
      });
      res.json({ message: 'Marked read' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /profile ───────────────────────────────────────────────────────────────
router.get(
  '/profile',
  authenticate,
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      let providerProfile = null;
      let stats = {};

      if (user.role === 'Provider') {
        providerProfile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });

        // Compute Provider stats from completed bookings
        const completedBookings = await prisma.booking.findMany({
          where: { providerId: user.id, status: 'COMPLETED' },
          select: { hours: true, providerPayout: true },
        });
        stats = {
          totalSessions: completedBookings.length,
          totalEarned: completedBookings.reduce((sum, b) => sum + toNum(b.providerPayout || 0), 0),
        };
      } else if (user.role === 'CUSTOMER' || user.role === 'SALON') {
        // Customer-type roles: compute stats from completed bookings.
        // Always return numbers (0, not undefined) so the profile shows "0h"/"$0"
        // instead of a blank for users with no completed bookings yet.
        const completedBookings = await prisma.booking.findMany({
          where: { customerId: user.id, status: 'COMPLETED' },
          select: { hours: true, price: true },   // DB column is `price` (API alias: totalPrice)
        });
        stats = {
          totalBookings: completedBookings.length,
          totalHours: completedBookings.reduce((sum, b) => sum + (b.hours || 0), 0),
          totalSpent: completedBookings.reduce((sum, b) => sum + toNum(b.price || 0), 0),
        };
      }

      // Strip sensitive / internal fields before sending
      // Also strip any legacy base64 photoUrls — they bloat responses and belong in Blob storage
      const { expoPushToken: _token, ...userOut } = user;
      if (userOut.photoUrl?.startsWith('data:')) userOut.photoUrl = null;
      if (providerProfile?.photoUrl?.startsWith('data:')) providerProfile.photoUrl = null;
      // Prisma Decimal → JSON string; app calls rating.toFixed() and crashes.
      userOut.rating = toNum(userOut.rating) ?? 0;
      res.json({ user: { ...userOut, ...stats }, providerProfile });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /tip/:bookingId/confirm ───────────────────────────────────────────────
router.post(
  '/tip/:bookingId/confirm',
  authenticate,
  requireRole('CUSTOMER'),
  async (req, res) => {
    try {
      const booking = await prisma.booking.findFirst({
        where: { id: req.params.bookingId, customerId: req.user.id, status: 'COMPLETED' },
      });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (booking.tipPaid) return res.status(409).json({ error: 'Tip already confirmed' });

      await prisma.booking.update({ where: { id: booking.id }, data: { tipPaid: true } });

      const io = req.app.get('io');
      if (io && booking.providerId) {
        io.to(`user-${booking.providerId}`).emit('tip-received', {
          amount: toNum(booking.tipAmount),
          bookingId: booking.id,
        });
      }
      if (booking.providerId) {
        notify({
          userId: booking.providerId,
          type: 'tip',
          title: 'You received a tip!',
          body: `$${toNum(booking.tipAmount)} tip added to your earnings.`,
          bookingId: booking.id,
        }).catch(() => {});
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('POST /tip/:bookingId/confirm error:', e);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /tip/:bookingId — stub ────────────────────────────────────────────────
router.post(
  '/tip/:bookingId',
  authenticate,
  requireRole('CUSTOMER'),
  async (_req, res) => {
    res.status(503).json({ error: 'Tips not available yet' });
  }
);

module.exports = router;
