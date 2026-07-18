#!/usr/bin/env node
'use strict';
/**
 * Seed a dev admin for the web admin panel (admin/).
 *
 * Idempotent: upserts by username, so re-running just resets the password.
 * Creates an `Admin` row (the model the web panel's /admin/login uses).
 *
 * Usage:
 *   npm run seed:admin                       # uses env / defaults below
 *   ADMIN_USERNAME=foo ADMIN_PASSWORD=bar npm run seed:admin
 *
 * Refuses to run when NODE_ENV=production unless ALLOW_PROD_SEED=1.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

const USERNAME = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || 'devadmin123';
const EMAIL    = process.env.ADMIN_EMAIL || 'admin@glow.dev';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== '1') {
    console.error('✘ Refusing to seed an admin in production. Set ALLOW_PROD_SEED=1 to override.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const admin = await prisma.admin.upsert({
    where:  { username: USERNAME },
    update: { passwordHash, isActive: true },
    create: {
      username: USERNAME,
      passwordHash,
      email: EMAIL,
      role: 'SUPER_ADMIN',
      isActive: true,
      canApproveProvider: true,
      canVerifyDocuments: true,
      canManageBookings: true,
      canViewAnalytics: true,
    },
  });

  console.log('✅ Dev admin ready');
  console.log(`   username: ${admin.username}`);
  console.log(`   password: ${PASSWORD}`);
  console.log('   Log in at the admin panel (/admin/login).');
}

main()
  .catch((e) => { console.error('✘ Seed failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
