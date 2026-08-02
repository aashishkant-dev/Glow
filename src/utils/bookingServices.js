// src/utils/bookingServices.js
'use strict';

const prisma = require('../lib/prisma');

// Booking.hours is validated as an int 1..12 on POST /bookings and is used for
// scheduling/conflict-window math everywhere else (provider.js's overlap check,
// nearby-job filtering). Convert a summed minute total into that same shape:
// round UP so the conflict window never under-covers the real appointment,
// clamp to the validator's own 1..12 range so a summary can never make an
// otherwise-valid booking unsavable.
function hoursFromDurationMin(totalDurationMin) {
  const raw = Math.ceil(Number(totalDurationMin) / 60);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, 12);
}

// Booking.serviceType is read verbatim by admin dashboards, provider earnings,
// push copy, and chat headers. Keep it a short human string: the first service,
// plus a "+N more" suffix when there are others.
function summarizeServiceType(names) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1} more`;
}

function unprocessable(message) {
  return Object.assign(new Error(message), { status: 422 });
}

// Shared tail of both pricing models: sum the resolved lines into the summary
// fields the Booking row stores, so PER_SERVICE and HOURLY can never drift
// into producing different result shapes.
function buildResult(lines) {
  const listedTotal      = Math.round(lines.reduce((sum, l) => sum + l.price, 0) * 100) / 100;
  const totalDurationMin = lines.reduce((sum, l) => sum + l.durationMin, 0);

  return {
    lines,
    listedTotal,
    totalDurationMin,
    summaryServiceType: summarizeServiceType(lines.map(l => l.name)),
    summaryHours:       hoursFromDurationMin(totalDurationMin),
  };
}

// One hour, in minutes. An HOURLY artist sells time, not individually-priced
// named services, so each selected service bills as a single hour at their
// rate — matching listedPriceFor's `hourlyRate * hours` with the 1-hour
// default the rest of the booking flow already assumes.
const HOURLY_LINE_DURATION_MIN = 60;

// Resolves each requested service to a priced line item, honouring the
// artist's pricingModel (ProviderProfile.pricingModel, which DEFAULTS to
// HOURLY — the majority case, so this cannot be menu-only):
//
//   PER_SERVICE — resolve against THIS artist's own active ProviderService
//     menu. The artist alone controls price, there is no platform or catalog
//     fallback (same rule as listedPriceFor in utils/pricing.js). If ANY
//     requested service is missing from that menu the whole call throws 422:
//     a partially-priced booking is never created.
//
//   HOURLY — the artist has no per-service catalog to price against, just a
//     single hourlyRate. Each requested service is therefore billed as one
//     hour of that artist's time (price = hourlyRate, durationMin = 60), and
//     multi-select still works: picking "Makeup" + "Hair Styling" books two
//     hours at their rate. Names are accepted verbatim (they come from the
//     platform's standard service list, not from an artist-owned menu), so
//     there is no menu lookup and no off-menu rejection for this model.
//
// Either way, an artist with no usable price is 422 — never silently free.
async function resolveBookingServices(requestedServices, providerUserId) {
  if (!Array.isArray(requestedServices) || requestedServices.length === 0) {
    throw unprocessable('Select at least one service.');
  }

  // Preserve the customer's selection order, but never charge twice for the
  // same service if the client somehow sends a duplicate.
  const requestedNames = [];
  for (const entry of requestedServices) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) throw unprocessable('Each service must have a name.');
    if (!requestedNames.includes(name)) requestedNames.push(name);
  }

  const profile = await prisma.providerProfile.findUnique({
    where:  { userId: providerUserId },
    select: { pricingModel: true, hourlyRate: true },
  });

  // Treat a missing profile as HOURLY-with-no-rate: unbookable, not free.
  if (profile?.pricingModel !== 'PER_SERVICE') {
    const rate = profile?.hourlyRate != null ? parseFloat(profile.hourlyRate.toString()) : NaN;
    if (!(rate > 0)) {
      throw unprocessable('This artist has not set a price yet.');
    }
    const hourlyPrice = Math.round(rate * 100) / 100;
    const hourlyLines = requestedNames.map(name => ({
      serviceItemId: null,
      name,
      price:         hourlyPrice,
      durationMin:   HOURLY_LINE_DURATION_MIN,
    }));
    return buildResult(hourlyLines);
  }

  const menu = await prisma.providerService.findMany({
    where:  { profile: { userId: providerUserId }, name: { in: requestedNames }, active: true },
    select: { serviceItemId: true, name: true, price: true, durationMin: true },
  });

  const byName = new Map(menu.map(m => [m.name, m]));
  const missing = requestedNames.filter(n => !byName.has(n));
  if (missing.length) {
    throw unprocessable(`This artist does not offer: ${missing.join(', ')}.`);
  }

  const lines = requestedNames.map(name => {
    const m = byName.get(name);
    const price = parseFloat(m.price.toString());
    if (!(price > 0)) {
      throw unprocessable(`This artist has not set a price for ${name} yet.`);
    }
    return {
      serviceItemId: m.serviceItemId ?? null,
      name:          m.name,
      price:         Math.round(price * 100) / 100,
      durationMin:   Number(m.durationMin),
    };
  });

  return buildResult(lines);
}

module.exports = { resolveBookingServices, summarizeServiceType, hoursFromDurationMin };
