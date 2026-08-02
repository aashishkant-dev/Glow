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

// Resolves each requested service against THIS artist's own active
// ProviderService menu — the artist alone controls price, there is no platform
// or catalog fallback (same rule as listedPriceFor in utils/pricing.js).
// If ANY requested service is missing from that menu the whole call throws 422:
// a partially-priced booking is never created.
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

module.exports = { resolveBookingServices, summarizeServiceType, hoursFromDurationMin };
