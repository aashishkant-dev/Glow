// src/routes/public.js
// Unauthenticated, read-only endpoints consumed by the marketing landing page.
// Everything returned here is public by design — never include phone, email,
// precise location, documents, or payout data.
'use strict';

const express = require('express');
const prisma  = require('../lib/prisma');
const { cacheGet, cacheSet } = require('../utils/cache');

const router = express.Router();

// First name + last initial: "Maria Oliveira" → "Maria O."
function publicName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// Prisma Decimal → JS number
function toNum(v) { return v == null ? v : parseFloat(v.toString()); }

// ── GET /public/providers ───────────────────────────────────────────────────────────
// Approved, onboarded, non-deleted Providers who haven't opted out of the public
// directory. Ordered by rating; capped. Cached 1h (Redis) + CDN cache headers.
router.get('/providers', async (_req, res) => {
  try {
    const CACHE_KEY = 'public:providers';
    let payload = await cacheGet(CACHE_KEY);

    if (!payload) {
      const users = await prisma.user.findMany({
        where: {
          role: 'Provider',
          deletedAt: null,
          onboardingComplete: true,
          providerProfile: { approvedByAdmin: true, publicProfile: true },
        },
        orderBy: [{ rating: 'desc' }, { ratingCount: 'desc' }],
        take: 12,
        select: {
          id: true,
          name: true,
          photoUrl: true,
          rating: true,
          ratingCount: true,
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
            },
          },
          _count: {
            select: { bookingsAsProvider: { where: { status: 'COMPLETED' } } },
          },
        },
      });

      const total = await prisma.user.count({
        where: {
          role: 'Provider',
          deletedAt: null,
          onboardingComplete: true,
          providerProfile: { approvedByAdmin: true, publicProfile: true },
        },
      });

      payload = {
        total,
        providers: users.map(u => ({
          id: u.id,
          name: publicName(u.name),
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
        })),
      };
      await cacheSet(CACHE_KEY, payload, 3600);
    }

    res.set('Cache-Control', process.env.DISABLE_CACHE ? 'no-store' : 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(payload);
  } catch (err) {
    console.error('GET /public/providers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ── GET /public/catalog ───────────────────────────────────────────────────────
// Service categories + catalog items (names, base prices, durations). Public by
// design — used by the app home screen and the landing site. Cached 10 min.
router.get('/catalog', async (_req, res) => {
  try {
    const CACHE_KEY = 'public:catalog';
    let payload = await cacheGet(CACHE_KEY);
    if (!payload) {
      const categories = await prisma.serviceCategory.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, slug: true, icon: true,
          services: {
            where: { active: true },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, description: true, icon: true, basePrice: true, durationMin: true, popular: true },
          },
        },
      });
      payload = {
        categories: categories.map(c => ({
          ...c,
          services: c.services.map(s => ({ ...s, basePrice: toNum(s.basePrice) })),
        })),
      };
      await cacheSet(CACHE_KEY, payload, 600);
    }
    res.set('Cache-Control', process.env.DISABLE_CACHE ? 'no-store' : 'public, max-age=300');
    res.json(payload);
  } catch (err) {
    console.error('GET /public/catalog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
