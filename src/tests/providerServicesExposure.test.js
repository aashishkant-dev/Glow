// src/tests/providerServicesExposure.test.js
// DB-isolated: `../lib/prisma` is mocked via a Proxy — no real database is touched.
// Guards the provider-facing money-redaction contract: providers see per-line
// service prices and providerPayout, and NEVER Booking.price or platformFee.

process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test-secret-for-jest-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/glow_test';
process.env.NODE_ENV     = 'test';

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

jest.mock('../socket', () => ({ initSocket: () => ({ on: jest.fn(), emit: jest.fn() }) }));

jest.mock('../utils/cache', () => ({
  getClient:         () => null,
  get:               jest.fn().mockResolvedValue(null),
  set:               jest.fn().mockResolvedValue(null),
  cacheGet:          jest.fn().mockResolvedValue(null),
  cacheSet:          jest.fn().mockResolvedValue(null),
  cacheDel:          jest.fn().mockResolvedValue(null),
  cacheFlushPattern: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/prisma', () => {
  const ARTIST = { id: 'artist1', name: 'Test Artist', role: 'Provider', deletedAt: null, lat: 46.49, lng: -80.99 };
  const BOOKING_ROW = {
    id: 'booking1',
    customerId: 'cust1',
    providerId: 'artist1',
    serviceType: 'Knotless Braids +1 more',
    hours: 3,
    status: 'ACCEPTED',
    scheduledAt: new Date(Date.now() + 86400000),
    lat: 46.49, lng: -80.99, address: '123 Main St',
    price: { toString: () => '135.00' },
    platformFee: { toString: () => '0.00' },
    providerPayout: { toString: () => '135.00' },
    tipAmount: { toString: () => '0.00' },
    ratingValue: null, providerRatingValue: null,
    urgency: 'routine',
    services: [
      { id: 'bs0', serviceItemId: 'item_braids', name: 'Knotless Braids',  price: { toString: () => '120.00' }, durationMin: 150 },
      { id: 'bs1', serviceItemId: 'item_brows',  name: 'Eyebrow Threading', price: { toString: () => '15.00'  }, durationMin: 15  },
    ],
    customer: { id: 'cust1', name: 'Test Client', phone: '+14165550100', rating: null, photoUrl: '', address: '' },
  };
  function stub() {
    return {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst:  jest.fn().mockResolvedValue(null),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn().mockResolvedValue({}),
      update:     jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count:      jest.fn().mockResolvedValue(0),
    };
  }
  const handler = {
    get(_t, prop) {
      if (prop === 'user') return { ...stub(), findUnique: jest.fn().mockResolvedValue(ARTIST) };
      if (prop === 'providerProfile') {
        return { ...stub(), findUnique: jest.fn().mockResolvedValue({ userId: 'artist1', approvedByAdmin: true }) };
      }
      if (prop === 'booking') {
        return { ...stub(), findMany: jest.fn().mockResolvedValue([BOOKING_ROW]) };
      }
      return stub();
    },
  };
  return new Proxy({}, handler);
});

const app = require('../app');
const token = jwt.sign({ userId: 'artist1', role: 'Provider' }, JWT_SECRET, { algorithm: 'HS256' });

describe('GET /jobs/my — itemized services', () => {
  it('returns per-line service items', async () => {
    const res = await request(app).get('/jobs/my').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bookings[0].services).toEqual([
      { _id: 'bs0', serviceItemId: 'item_braids', name: 'Knotless Braids',   price: 120, durationMin: 150 },
      { _id: 'bs1', serviceItemId: 'item_brows',  name: 'Eyebrow Threading', price: 15,  durationMin: 15  },
    ]);
  });

  it('never exposes Booking.price or Booking.platformFee to a provider', async () => {
    const res = await request(app).get('/jobs/my').set('Authorization', `Bearer ${token}`);
    const job = res.body.bookings[0];
    expect(job).not.toHaveProperty('price');
    expect(job).not.toHaveProperty('platformFee');
    expect(job.providerPayout).toBe(135);
    expect(job.totalPrice).toBe(135); // alias of payout, never gross
  });

  it('keeps the denormalized serviceType summary alongside the itemized list', async () => {
    const res = await request(app).get('/jobs/my').set('Authorization', `Bearer ${token}`);
    expect(res.body.bookings[0].serviceType).toBe('Knotless Braids +1 more');
  });
});
