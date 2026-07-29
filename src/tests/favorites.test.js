// src/tests/favorites.test.js
// Same DB-isolation strategy as api.test.js: `../lib/prisma` is fully mocked via
// a Proxy, so these tests never touch a real database. See api.test.js's header
// comment for the full rationale.

process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test-secret-for-jest-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/glow_test';
process.env.NODE_ENV     = 'test';

const request = require('supertest');
const jwt     = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

jest.mock('../socket', () => ({
  initSocket: () => ({ on: jest.fn(), emit: jest.fn() }),
}));

jest.mock('../utils/cache', () => ({
  getClient:         () => null,
  get:               jest.fn().mockResolvedValue(null),
  set:               jest.fn().mockResolvedValue(null),
  cacheGet:          jest.fn().mockResolvedValue(null),
  cacheSet:          jest.fn().mockResolvedValue(null),
  cacheDel:          jest.fn().mockResolvedValue(null),
  cacheFlushPattern: jest.fn().mockResolvedValue(null),
}));

// ── Users known to the mocked `prisma.user.findUnique` ──────────────────────
const CUSTOMER = {
  id: 'cust1', name: 'Test Customer', role: 'CUSTOMER', deletedAt: null,
  rating: null, ratingCount: 0, skinTone: null, skinType: null, preferredOccasions: [],
};
const PROVIDER = {
  id: 'artist1', name: 'Maria Oliveira', role: 'Provider', deletedAt: null,
  photoUrl: '', rating: 4.8, ratingCount: 12, lat: 43.7, lng: -79.4,
};
// Shape returned by the `include: { provider: { select: {...} } }` in the
// GET /favorites route — mirrors what public.js's GET /providers select returns.
const PROVIDER_WITH_RELATIONS = {
  ...PROVIDER,
  providerProfile: null,
  _count: { bookingsAsProvider: 0 },
};

// In-memory favorite store backing the mocked prisma.favorite model, so the
// idempotency of POST/DELETE can be verified for real rather than assumed from
// reading the route's upsert/deleteMany calls.
let favoriteRows = [];

const mockFindUnique = jest.fn(({ where }) => {
  if (where.id === CUSTOMER.id) return Promise.resolve(CUSTOMER);
  if (where.id === PROVIDER.id) return Promise.resolve(PROVIDER);
  return Promise.resolve(null);
});

jest.mock('../lib/prisma', () => {
  function mockModelStub() {
    return {
      findUnique:  jest.fn().mockResolvedValue(null),
      findFirst:   jest.fn().mockResolvedValue(null),
      findMany:    jest.fn().mockResolvedValue([]),
      create:      jest.fn().mockResolvedValue({}),
      update:      jest.fn().mockResolvedValue({}),
      updateMany:  jest.fn().mockResolvedValue({ count: 0 }),
      upsert:      jest.fn().mockResolvedValue({}),
      delete:      jest.fn().mockResolvedValue({}),
      deleteMany:  jest.fn().mockResolvedValue({ count: 0 }),
      count:       jest.fn().mockResolvedValue(0),
      aggregate:   jest.fn().mockResolvedValue({}),
    };
  }

  const handler = {
    get(_target, prop) {
      if (prop === 'user') {
        return {
          ...mockModelStub(),
          findUnique: (...a) => global.__mockFindUnique(...a),
          update:     (...a) => global.__mockUserUpdate(...a),
        };
      }
      if (prop === 'favorite') {
        return {
          ...mockModelStub(),
          upsert:     (...a) => global.__mockFavoriteUpsert(...a),
          deleteMany: (...a) => global.__mockFavoriteDeleteMany(...a),
          findMany:   (...a) => global.__mockFavoriteFindMany(...a),
        };
      }
      if (prop === '$queryRaw')    return jest.fn().mockResolvedValue([{ '?column?': 1 }]);
      if (prop === '$connect')     return () => Promise.resolve();
      if (prop === '$disconnect')  return () => Promise.resolve();
      if (prop === '$transaction') return (fn) => fn({});
      return mockModelStub();
    },
  };
  return new Proxy({}, handler);
});

// Wired up via globals because jest.mock() factories can't reference
// out-of-scope variables (Jest hoists the factory above module init) — same
// constraint documented in api.test.js.
global.__mockFindUnique = mockFindUnique;
global.__mockUserUpdate = jest.fn().mockImplementation(({ where, data }) =>
  Promise.resolve({ ...CUSTOMER, ...data, id: where.id })
);
global.__mockFavoriteUpsert = jest.fn().mockImplementation(({ where }) => {
  const { customerId, providerId } = where.customerId_providerId;
  const existing = favoriteRows.find(f => f.customerId === customerId && f.providerId === providerId);
  if (existing) return Promise.resolve(existing);
  const row = { id: `fav_${favoriteRows.length + 1}`, customerId, providerId, createdAt: new Date() };
  favoriteRows.push(row);
  return Promise.resolve(row);
});
global.__mockFavoriteDeleteMany = jest.fn().mockImplementation(({ where }) => {
  const before = favoriteRows.length;
  favoriteRows = favoriteRows.filter(f => !(f.customerId === where.customerId && f.providerId === where.providerId));
  return Promise.resolve({ count: before - favoriteRows.length });
});
global.__mockFavoriteFindMany = jest.fn().mockImplementation(({ where }) => {
  const rows = favoriteRows.filter(f => f.customerId === where.customerId);
  return Promise.resolve(
    rows.map(f => ({ ...f, provider: f.providerId === PROVIDER.id ? PROVIDER_WITH_RELATIONS : null }))
  );
});

const app = require('../app');

describe('Favorites', () => {
  const customerToken = jwt.sign({ userId: CUSTOMER.id, role: 'CUSTOMER' }, JWT_SECRET, { algorithm: 'HS256' });

  beforeEach(() => {
    favoriteRows = [];
    global.__mockFavoriteUpsert.mockClear();
    global.__mockFavoriteDeleteMany.mockClear();
  });

  test('POST /providers/:id/favorite creates a favorite and returns 204', async () => {
    const res = await request(app)
      .post(`/providers/${PROVIDER.id}/favorite`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(204);
    expect(favoriteRows).toHaveLength(1);
    expect(favoriteRows[0]).toMatchObject({ customerId: CUSTOMER.id, providerId: PROVIDER.id });
  });

  test('POST /providers/:id/favorite is idempotent — calling it twice creates no duplicate row', async () => {
    const res1 = await request(app)
      .post(`/providers/${PROVIDER.id}/favorite`)
      .set('Authorization', `Bearer ${customerToken}`);
    const res2 = await request(app)
      .post(`/providers/${PROVIDER.id}/favorite`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res1.status).toBe(204);
    expect(res2.status).toBe(204);
    expect(favoriteRows).toHaveLength(1);
  });

  test('POST /providers/:id/favorite 404s for a non-existent or non-provider id', async () => {
    const res = await request(app)
      .post(`/providers/${CUSTOMER.id}/favorite`) // CUSTOMER exists but role !== 'Provider'
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(404);
  });

  test('GET /favorites returns the favorited provider shaped like a public provider card, with the FULL name (not public-masked)', async () => {
    await request(app)
      .post(`/providers/${PROVIDER.id}/favorite`)
      .set('Authorization', `Bearer ${customerToken}`);

    const res = await request(app)
      .get('/favorites')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(1);
    const card = res.body.providers[0];
    // Unlike GET /public/providers (which masks to "Maria O."), favorites is a
    // private authenticated list of artists the customer already chose, so the
    // full name is returned.
    expect(card.name).toBe(PROVIDER.name);
    expect(card).toEqual({
      id: PROVIDER.id,
      name: PROVIDER.name,
      photoUrl: '',
      rating: 4.8,
      ratingCount: 12,
      completedVisits: 0,
      qualificationType: 'Provider',
      experienceYears: 0,
      bio: '',
      specialties: [],
      languages: ['English'],
      policeCheckCleared: false,
      firstAidCertified: false,
      startingPrice: null,
      lat: 43.7,
      lng: -79.4,
    });
    // Field set must match GET /public/providers' card shape exactly.
    expect(Object.keys(card).sort()).toEqual([
      'bio', 'completedVisits', 'experienceYears', 'firstAidCertified',
      'id', 'languages', 'lat', 'lng', 'name', 'photoUrl',
      'policeCheckCleared', 'qualificationType', 'rating', 'ratingCount',
      'specialties', 'startingPrice',
    ].sort());
  });

  test('DELETE /providers/:id/favorite removes it and is idempotent', async () => {
    await request(app)
      .post(`/providers/${PROVIDER.id}/favorite`)
      .set('Authorization', `Bearer ${customerToken}`);

    const res1 = await request(app)
      .delete(`/providers/${PROVIDER.id}/favorite`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res1.status).toBe(204);
    expect(favoriteRows).toHaveLength(0);

    // Calling delete again on an already-removed favorite must not error.
    const res2 = await request(app)
      .delete(`/providers/${PROVIDER.id}/favorite`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res2.status).toBe(204);
  });

  test('favorite routes 401 without a token', async () => {
    const res = await request(app).get('/favorites');
    expect(res.status).toBe(401);
  });

  test('PATCH /profile accepts skinTone, skinType, preferredOccasions', async () => {
    const res = await request(app)
      .patch('/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ skinTone: 'MEDIUM', skinType: 'COMBINATION', preferredOccasions: ['Bridal', 'Everyday'] });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      skinTone: 'MEDIUM',
      skinType: 'COMBINATION',
      preferredOccasions: ['Bridal', 'Everyday'],
    });
  });

  test('PATCH /profile rejects an invalid skinTone', async () => {
    const res = await request(app)
      .patch('/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ skinTone: 'NOT_A_TONE' });
    expect(res.status).toBe(400);
  });

  test('PATCH /profile rejects an invalid preferredOccasions value', async () => {
    const res = await request(app)
      .patch('/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ preferredOccasions: ['NotARealOccasion'] });
    expect(res.status).toBe(400);
  });
});
