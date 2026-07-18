'use strict';

// Dedicated-request timeout sweep.
// A client can pick a SPECIFIC Provider. If that Provider neither accepts nor declines
// within REQUEST_TIMEOUT_MIN, we open the booking to the whole nearby pool so
// any available Provider can take it — the client is never left waiting forever.
//
// Lightweight: a setInterval that runs every few minutes (no external cron).
// Idempotent — only flips bookings that are still dedicated + unopened + stale.

const prisma = require('../lib/prisma');
const { pushTo } = require('../utils/push');

const REQUEST_TIMEOUT_MIN = parseInt(process.env.REQUEST_TIMEOUT_MIN, 10) || 30;
const SWEEP_EVERY_MS = 5 * 60 * 1000; // every 5 minutes

async function sweepOnce(io) {
  const cutoff = new Date(Date.now() - REQUEST_TIMEOUT_MIN * 60 * 1000);
  // Still REQUESTED, still tied to the originally-chosen Provider, not yet opened,
  // and the request is older than the timeout.
  const stale = await prisma.booking.findMany({
    where: {
      status: 'REQUESTED',
      openToPool: false,
      providerId: { not: null },
      providerRequestedAt: { not: null, lt: cutoff },
    },
    select: { id: true, customerId: true },
    take: 200,
  });
  if (stale.length === 0) return;

  for (const b of stale) {
    try {
      await prisma.booking.update({
        where: { id: b.id },
        // Open to the pool but KEEP the original providerId so the chosen Provider can still
        // accept from their inbox; the accept/skip handlers clear it appropriately.
        data:  { openToPool: true },
      });
      if (io) {
        io.to(`user-${b.customerId}`).emit('booking-status-changed', {
          bookingId: b.id, status: 'REQUESTED', reason: 'opened-to-pool',
        });
      }
      const customer = await prisma.user.findUnique({
        where: { id: b.customerId }, select: { expoPushToken: true },
      });
      if (customer?.expoPushToken) {
        pushTo(
          customer.expoPushToken,
          'Still finding your caregiver',
          'We’ve opened your request to more Providers nearby to get you matched faster.',
          { bookingId: b.id, type: 'booking' },
        ).catch(() => {});
      }
    } catch (e) {
      console.error('[requestTimeoutSweep] failed for booking', b.id, e.message);
    }
  }
  console.log(`[requestTimeoutSweep] opened ${stale.length} stale request(s) to the pool`);
}

function startRequestTimeoutSweep(io) {
  // Run shortly after boot, then on an interval.
  setTimeout(() => sweepOnce(io).catch(() => {}), 30 * 1000);
  setInterval(() => sweepOnce(io).catch(() => {}), SWEEP_EVERY_MS);
}

module.exports = { startRequestTimeoutSweep, sweepOnce };
