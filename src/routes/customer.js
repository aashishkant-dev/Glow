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
const { uploadFile } = require('../utils/storage');
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

const HOURLY_RATE = () => parseFloat(process.env.HOURLY_RATE) || 25;
const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0.18;
const COMMISSION_MIN  = parseFloat(process.env.COMMISSION_MIN) || 2.00;

// Beauty pricing: the chosen provider's own price for the service wins; otherwise
// the catalog base price; hourly rate only as a last-resort fallback.
async function priceForBooking(serviceType, hours, providerUserId, proposedPrice) {
  let listedPrice = null;

  if (providerUserId) {
    // Look up the provider's pricing model
    const profile = await prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
      select: { pricingModel: true, hourlyRate: true, priceNegotiable: true },
    });

    if (profile) {
      if (profile.pricingModel === 'PER_SERVICE') {
        // Per-service: use the provider's own price for this specific service
        const ps = await prisma.providerService.findFirst({
          where: { profile: { userId: providerUserId }, name: serviceType, active: true },
          select: { price: true },
        });
        if (ps && parseFloat(ps.price.toString()) > 0) {
          listedPrice = parseFloat(ps.price.toString());
        }
      } else {
        // Hourly: provider's hourly rate × hours
        if (profile.hourlyRate && parseFloat(profile.hourlyRate.toString()) > 0) {
          listedPrice = Math.round(parseFloat(profile.hourlyRate.toString()) * Number(hours) * 100) / 100;
        }
      }

      // If the provider allows negotiation and the client proposed a price, use it
      // (within ±50% of the listed price to prevent abuse)
      if (listedPrice != null && profile.priceNegotiable && proposedPrice != null) {
        const proposed = Number(proposedPrice);
        if (!isNaN(proposed) && proposed > 0) {
          const lowerBound = listedPrice * 0.5;
          const upperBound = listedPrice * 1.5;
          if (proposed >= lowerBound && proposed <= upperBound) {
            return Math.round(proposed * 100) / 100;
          }
        }
      }
    }
  }

  // Fallback: catalog base price
  if (listedPrice != null) return listedPrice;

  const item = await prisma.serviceItem.findFirst({
    where: { name: serviceType, active: true },
    select: { basePrice: true },
  });
  if (item && parseFloat(item.basePrice.toString()) > 0) return parseFloat(item.basePrice.toString());
  return Math.round(Number(hours) * HOURLY_RATE() * 100) / 100;
}

function computeFees(price) {
  const platformFee = Math.max(Math.round(price * COMMISSION_RATE * 100) / 100, COMMISSION_MIN);
  const providerPayout   = Math.round((price - platformFee) * 100) / 100;
  return { platformFee, providerPayout };
}

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

// ── Expo push notification helper ─────────────────────────────────────────────
async function notifyNearbyProviders(booking, lat, lng, io) {
  const radiusKm = parseFloat(process.env.NEARBY_RADIUS_KM) || 15;

  const profiles = await prisma.providerProfile.findMany({
    where: { approvedByAdmin: true, availability: true },
    select: { userId: true },
  });
  if (!profiles.length) return;

  const userIds = profiles.map(p => p.userId);

  const providerUsers = await prisma.user.findMany({
    where: {
      id:            { in: userIds },
      role:          'Provider',
      expoPushToken: { not: '' },
    },
    select: { id: true, lat: true, lng: true, expoPushToken: true },
  });

  const toNotify = providerUsers.filter(u => {
    if (u.lat === 0 && u.lng === 0) return false;
    return haversineKm(u.lat, u.lng, lat, lng) <= radiusKm;
  });

  if (!toNotify.length) return;

  const price = toNum(booking.price);
  const messages = toNotify.map(u => ({
    to:   u.expoPushToken,
    title: `New job nearby — $${price}`,
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
        totalPrice:  price,
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
  const { price, id, customer, provider, ...rest } = b;
  return {
    ...rest,
    _id:          id,
    totalPrice:   toNum(price),
    platformFee:  toNum(rest.platformFee),
    providerPayout:    toNum(rest.providerPayout),
    tipAmount:    toNum(rest.tipAmount),
    ratingValue:  toNum(rest.ratingValue),
    providerRatingValue: toNum(rest.providerRatingValue),
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
          pricingModel: true, hourlyRate: true, priceNegotiable: true,
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
    body('serviceType').trim().isIn(VALID_SERVICE_TYPES).withMessage(`serviceType must be one of: ${VALID_SERVICE_TYPES.join(', ')}`),
    body('hours').isInt({ min: 1, max: 12 }).withMessage('hours must be a whole number between 1 and 12'),
    body('notes').optional().trim().isLength({ max: 500 }).withMessage('notes must be 500 characters or fewer'),
    body('address').optional().trim().isLength({ max: 300 }).withMessage('address must be 300 characters or fewer'),
    body('recipientName').optional().trim().isLength({ max: 100 }).withMessage('recipientName must be 100 characters or fewer'),
    body('urgency').optional().isIn(['routine', 'urgent', 'emergency']).withMessage('urgency must be routine, urgent, or emergency'),
    body('scheduledAt').isISO8601().withMessage('scheduledAt must be a valid ISO 8601 date'),
    body('lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }).withMessage('lat must be a valid latitude'),
    body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).withMessage('lng must be a valid longitude'),
  ],
  validate,
  async (req, res) => {
    try {
      if (!req.user.phoneVerified) {
        return res.status(403).json({ error: 'PHONE_NOT_VERIFIED' });
      }
      const { serviceType, hours, scheduledAt, notes, providerId, proposedPrice } = req.body;

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
      const price = await priceForBooking(serviceType, hours, resolvedProviderId, proposedPrice);
      const { platformFee, providerPayout } = computeFees(price);

      const booking = await prisma.booking.create({
        data: {
          customerId:        req.user.id,
          serviceType,
          hours:             Number(hours),
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
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, rating: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, rating: true, photoUrl: true } },
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
          pricingModel: true, hourlyRate: true, priceNegotiable: true,
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
          policeCheckCleared: true,
          firstAidCertified: true,
          approvedByAdmin: true,
          photos: true,
          homeService: true,
          salonService: true,
          salonAddress: true,
          serviceRadiusKm: true,
          coverPhotoUrl: true,
          languages: true,
          pricingModel: true,
          hourlyRate: true,
          priceNegotiable: true,
          services: { where: { active: true }, select: { name: true, price: true, durationMin: true } },
          user: {
            select: {
              id: true,
              name: true,
              photoUrl: true,
              rating: true,
              ratingCount: true,
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
          customer: { select: { name: true } },
        },
      });

      res.json({
        provider: {
          id: profile.userId,
          profileId: profile.id,
          name: profile.user.name,
          photoUrl: profile.user.photoUrl,
          rating: toNum(profile.user.rating) ?? 0,
          ratingCount: profile.user.ratingCount ?? 0,
          qualificationType: profile.qualificationType,
          licenseNumber: profile.licenseNumber || '',
          collegeName: profile.collegeName || '',
          experienceYears: profile.experienceYears,
          specialties: profile.specialties ?? [],
          bio: profile.bio,
          policeCheckCleared: profile.policeCheckCleared,
          firstAidCertified: profile.firstAidCertified,
          photos: profile.photos ?? [],
          homeService: profile.homeService,
          salonService: profile.salonService,
          salonAddress: profile.salonAddress || '',
          serviceRadiusKm: profile.serviceRadiusKm,
          coverPhotoUrl: profile.coverPhotoUrl || '',
          languages: profile.languages ?? [],
          services: (profile.services || []).map(s => ({ name: s.name, price: toNum(s.price), durationMin: s.durationMin })),
          pricingModel: profile.pricingModel || 'HOURLY',
          hourlyRate: toNum(profile.hourlyRate),
          priceNegotiable: profile.priceNegotiable || false,
          completedBookings: completedCount,
          recentRatings: ratedBookings.map(b => ({
            id: b.id,
            rating: toNum(b.ratingValue) ?? 0,
            comment: b.ratingComment ?? '',
            customerName: b.customer?.name ? b.customer.name.split(' ')[0] + '.' : 'Anonymous',
            createdAt: b.updatedAt,
          })),
        },
      });
    } catch (err) {
      console.error('GET /providers/:id/public error:', err);
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
        title: `New booking request — $${booking.price}`,
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
          // Phone only returned to the assigned Provider — not to pool browsers
          customer: { select: { id: true, name: true, phone: true, rating: true, photoUrl: true } },
          provider:      { select: { id: true, name: true, phone: true, rating: true, ratingCount: true, photoUrl: true } },
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
  ],
  validate,
  async (req, res) => {
    try {
      const allowed = ['name', 'email', 'address', 'emergencyContact', 'preferredLanguage', 'gender', 'photoUrl'];
      const raw = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
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

// ── POST /profile/photo ────────────────────────────────────────────────────────
router.post(
  '/profile/photo',
  authenticate,
  async (req, res) => {
    try {
      const { photoBase64, mimeType = 'image/jpeg' } = req.body;
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

      await prisma.user.update({ where: { id: req.user.id }, data: { photoUrl } });

      if (req.user.role === 'Provider') {
        await prisma.providerProfile.upsert({
          where:  { userId: req.user.id },
          update: { photoUrl },
          create: { userId: req.user.id, photoUrl },
        });
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
