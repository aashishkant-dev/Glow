#!/usr/bin/env node
'use strict';
/**
 * Purge demo data created by scripts/seed-demo.js.
 *
 * Deletes:
 *   - all bookings tagged [demo-seed] (and their messages)
 *   - all notifications tagged [demo-seed]
 *   - demo users in the reserved +1705555xxxx range (and their Provider profiles,
 *     documents, payouts via cascade/manual delete)
 *
 * The reviewer account (DEMO_REVIEW_PHONE) is KEPT by default — Apple may
 * re-review after updates. Pass --purge-reviewer to delete it too.
 *
 * Usage:
 *   ALLOW_PROD_SEED=1 node scripts/cleanup-demo.js [--purge-reviewer]
 */
require('dotenv').config();
const prisma = require('../src/lib/prisma');

const DEMO_TAG = '[demo-seed]';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== '1') {
    console.error('✘ Set ALLOW_PROD_SEED=1 to clean demo data in production.');
    process.exit(1);
  }

  const bookings = await prisma.booking.findMany({
    where: { notes: { contains: DEMO_TAG } }, select: { id: true },
  });
  const ids = bookings.map(b => b.id);
  if (ids.length) {
    await prisma.message.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`✅ Deleted ${ids.length} demo bookings`);

  const n = await prisma.notification.deleteMany({ where: { body: { contains: DEMO_TAG } } });
  console.log(`✅ Deleted ${n.count} demo notifications`);

  const demoUsers = await prisma.user.findMany({
    where: { phone: { startsWith: '+1705555' } }, select: { id: true, phone: true },
  });
  const purgeReviewer = process.argv.includes('--purge-reviewer');
  const reviewerPhone = process.env.DEMO_REVIEW_PHONE;
  if (purgeReviewer && reviewerPhone) {
    const r = await prisma.user.findUnique({ where: { phone: reviewerPhone }, select: { id: true, phone: true } });
    if (r) demoUsers.push(r);
  }

  for (const u of demoUsers) {
    // Any remaining bookings referencing this user block the delete — remove them.
    const rest = await prisma.booking.findMany({
      where: { OR: [{ customerId: u.id }, { providerId: u.id }] }, select: { id: true },
    });
    const restIds = rest.map(b => b.id);
    if (restIds.length) {
      await prisma.message.deleteMany({ where: { bookingId: { in: restIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: restIds } } });
    }
    await prisma.payout.deleteMany({ where: { providerId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }); // ProviderProfile/docs/notifications cascade
    console.log(`✅ Deleted demo user ${u.phone}`);
  }

  console.log('\nDone.');
}

main()
  .catch((e) => { console.error('✘ Cleanup failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
