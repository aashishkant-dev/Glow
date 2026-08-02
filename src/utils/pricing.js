// src/utils/pricing.js
'use strict';

const prisma = require('../lib/prisma');

// No platform commission — providers keep the full listed/negotiated price.
const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0;
const COMMISSION_MIN  = parseFloat(process.env.COMMISSION_MIN) || 0;

// Looks up the real price a specific Provider charges for a service — their
// own PER_SERVICE menu price, or hourlyRate × hours if they price hourly.
// Returns null if the Provider has no usable price for this service (no
// platform/catalog fallback — artists fully control price, never the platform).
async function listedPriceFor(serviceType, hours, providerUserId) {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId: providerUserId },
    select: { pricingModel: true, hourlyRate: true, priceNegotiable: true },
  });
  if (!profile) return null;

  if (profile.pricingModel === 'PER_SERVICE') {
    const ps = await prisma.providerService.findFirst({
      where: { profile: { userId: providerUserId }, name: serviceType, active: true },
      select: { price: true },
    });
    if (ps && parseFloat(ps.price.toString()) > 0) return parseFloat(ps.price.toString());
    return null;
  }

  if (profile.hourlyRate && parseFloat(profile.hourlyRate.toString()) > 0) {
    return Math.round(parseFloat(profile.hourlyRate.toString()) * Number(hours) * 100) / 100;
  }
  return null;
}

// Beauty pricing: the artist alone controls price — there is no platform or
// catalog fallback. For a dedicated booking (providerUserId given), resolves
// that artist's real listed price, applying a negotiated offer if allowed.
// Throws if the artist has no usable price — never silently guesses one.
// For an open-pool booking (providerUserId null — no artist chosen yet),
// returns null: price is deferred until an artist accepts the job and their
// real price is applied (see POST /jobs/:id/accept).
async function priceForBooking(serviceType, hours, providerUserId, proposedPrice) {
  if (!providerUserId) return null;

  const listedPrice = await listedPriceFor(serviceType, hours, providerUserId);
  if (listedPrice == null) {
    throw Object.assign(
      new Error('This artist has not set a price for this service yet.'),
      { status: 422 }
    );
  }

  // If the provider allows negotiation and the client proposed a price, use it.
  // Any amount at or above 50% of listed is accepted — including offers ABOVE
  // listed price. Glow has no say in the final price either way; the 50% floor
  // is only noise-reduction against accidental/junk low offers, not a platform
  // price control. The artist can still reject any offer they don't like.
  if (proposedPrice != null) {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
      select: { priceNegotiable: true },
    });
    if (profile?.priceNegotiable) {
      const proposed = Number(proposedPrice);
      if (!isNaN(proposed) && proposed > 0) {
        const lowerBound = listedPrice * 0.5;
        if (proposed >= lowerBound) {
          return Math.round(proposed * 100) / 100;
        }
      }
    }
  }

  return listedPrice;
}

function computeFees(price) {
  const platformFee = Math.max(Math.round(price * COMMISSION_RATE * 100) / 100, COMMISSION_MIN);
  // Floored at 0 — COMMISSION_MIN is env-configurable and not schema-bounded
  // against the actual price. Not reachable with today's real prices/default
  // $2 minimum, but a low real service price combined with a raised
  // COMMISSION_MIN could otherwise drive this negative with no defense.
  const providerPayout = Math.max(0, Math.round((price - platformFee) * 100) / 100);
  return { platformFee, providerPayout };
}

module.exports = { priceForBooking, listedPriceFor, computeFees, COMMISSION_RATE, COMMISSION_MIN };
