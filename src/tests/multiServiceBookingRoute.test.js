// src/tests/multiServiceBookingRoute.test.js
// DB-isolated: `../lib/prisma` is mocked via a Proxy — no real database is touched.

process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test-secret-for-jest-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/glow_test';
process.env.NODE_ENV     = 'test';
// Force zero commission for this suite's dollar-amount assertions — app.js's
// `dotenv.config()` (called when '../app' is required below) does not override
// already-set vars, but WILL pull the repo's real .env values in for anything
// not yet set. Without this, COMMISSION_RATE=0.18 from .env leaks into these
// pricing assertions.
process.env.COMMISSION_RATE = '0';
process.env.COMMISSION_MIN  = '0';

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

jest.mock('../utils/notify', () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/push',   () => ({ sendPush: jest.fn().mockResolvedValue(undefined), pushTo: jest.fn() }));

// Captures the exact `data` passed to prisma.booking.create so the test can
// assert on the nested BookingService write + the denormalized summary fields.
const mockBookingCreate = jest.fn();

jest.mock('../lib/prisma', () => {
  const CUSTOMER = {
    id: 'cust1', role: 'CUSTOMER', name: 'Test Client',
    phone: '+14165550100', phoneVerified: true, deletedAt: null, lat: 46.49, lng: -80.99,
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
      if (prop === 'user') {
        return { ...stub(), findUnique: jest.fn().mockResolvedValue(CUSTOMER) };
      }
      if (prop === 'providerProfile') {
        return {
          ...stub(),
          // pricingModel is required for resolveBookingServices to use the
          // menu path — an artist with a ProviderService catalog is PER_SERVICE.
          // Overridable so a test can exercise an HOURLY artist instead.
          findUnique: jest.fn(() => Promise.resolve({
            userId: 'artist1', approvedByAdmin: true, priceNegotiable: true,
            pricingModel: 'PER_SERVICE', hourlyRate: { toString: () => '50.00' },
            ...(global.__providerProfileOverride ?? {}),
          })),
        };
      }
      if (prop === 'providerService') {
        return {
          ...stub(),
          findMany: jest.fn().mockResolvedValue([
            { serviceItemId: 'item_braids', name: 'Knotless Braids',  price: { toString: () => '120.00' }, durationMin: 150 },
            { serviceItemId: 'item_brows',  name: 'Eyebrow Threading', price: { toString: () => '15.00'  }, durationMin: 15  },
          ]),
        };
      }
      if (prop === 'booking') {
        return {
          ...stub(),
          create: (...a) => {
            mockBookingCreate(...a);
            const data = a[0].data;
            return Promise.resolve({
              id: 'booking1',
              ...data,
              services: (data.services?.create ?? []).map((s, i) => ({ id: `bs${i}`, ...s })),
              customer: { id: 'cust1', name: 'Test Client', phone: '+14165550100', rating: null, photoUrl: '' },
              provider: { id: 'artist1', name: 'Test Artist', phone: '+14165550101', rating: null, photoUrl: '' },
            });
          },
        };
      }
      if (prop === '$transaction') return (fn) => (typeof fn === 'function' ? fn({}) : Promise.all(fn));
      return stub();
    },
  };
  return new Proxy({}, handler);
});

const app = require('../app');
const token = jwt.sign({ userId: 'cust1', role: 'CUSTOMER' }, JWT_SECRET, { algorithm: 'HS256' });

function futureISO() { return new Date(Date.now() + 86400000).toISOString(); }

describe('POST /bookings — multi-service', () => {
  beforeEach(() => mockBookingCreate.mockClear());

  it('creates one BookingService row per selected service', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        services: [{ name: 'Knotless Braids' }, { name: 'Eyebrow Threading' }],
        providerId: 'cabcdefghijklmnopqrstuvwx',
        scheduledAt: futureISO(),
        lat: 46.49, lng: -80.99, address: '123 Main St',
      });
    expect(res.status).toBe(201);
    const data = mockBookingCreate.mock.calls[0][0].data;
    expect(data.services.create).toEqual([
      { serviceItemId: 'item_braids', name: 'Knotless Braids',   price: 120, durationMin: 150 },
      { serviceItemId: 'item_brows',  name: 'Eyebrow Threading', price: 15,  durationMin: 15  },
    ]);
  });

  it('denormalizes serviceType, price and hours as summaries of the line items', async () => {
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        services: [{ name: 'Knotless Braids' }, { name: 'Eyebrow Threading' }],
        providerId: 'cabcdefghijklmnopqrstuvwx',
        scheduledAt: futureISO(),
        lat: 46.49, lng: -80.99,
      });
    const data = mockBookingCreate.mock.calls[0][0].data;
    expect(data.serviceType).toBe('Knotless Braids +1 more');
    expect(data.price).toBe(135);
    expect(data.hours).toBe(3); // 165 min -> ceil(2.75) = 3
    expect(data.providerPayout).toBe(135); // commission is 0
    expect(data.platformFee).toBe(0);
  });

  it('books an HOURLY artist end-to-end, billing each service as one hour at their rate', async () => {
    // HOURLY is the ProviderProfile default and the majority of real artists.
    // They have no ProviderService menu, so the menu path would 422 them —
    // this asserts the whole route accepts and correctly prices them.
    global.__providerProfileOverride = {
      pricingModel: 'HOURLY',
      hourlyRate:   { toString: () => '50.00' },
    };
    try {
      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          services: [{ name: 'Makeup' }, { name: 'Hair Styling' }],
          providerId: 'cabcdefghijklmnopqrstuvwx',
          scheduledAt: futureISO(),
          lat: 46.49, lng: -80.99,
        });

      expect(res.status).toBe(201);
      const data = mockBookingCreate.mock.calls[0][0].data;
      expect(data.services.create).toEqual([
        { serviceItemId: null, name: 'Makeup',       price: 50, durationMin: 60 },
        { serviceItemId: null, name: 'Hair Styling', price: 50, durationMin: 60 },
      ]);
      expect(data.price).toBe(100);
      expect(data.hours).toBe(2);
      expect(data.serviceType).toBe('Makeup +1 more');
    } finally {
      delete global.__providerProfileOverride;
    }
  });

  it('applies a negotiated offer to the summed total, not per line item', async () => {
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        services: [{ name: 'Knotless Braids' }, { name: 'Eyebrow Threading' }],
        providerId: 'cabcdefghijklmnopqrstuvwx',
        scheduledAt: futureISO(),
        proposedPrice: 100,
        lat: 46.49, lng: -80.99,
      });
    const data = mockBookingCreate.mock.calls[0][0].data;
    expect(data.price).toBe(100);               // negotiated total
    expect(data.services.create).toHaveLength(2); // line items keep their LISTED prices
    expect(data.services.create[0].price).toBe(120);
  });

  it('rejects an offer below 50% of the summed total and falls back to the listed total', async () => {
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        services: [{ name: 'Knotless Braids' }, { name: 'Eyebrow Threading' }],
        providerId: 'cabcdefghijklmnopqrstuvwx',
        scheduledAt: futureISO(),
        proposedPrice: 10,
        lat: 46.49, lng: -80.99,
      });
    expect(mockBookingCreate.mock.calls[0][0].data.price).toBe(135);
  });

  it('422s when a requested service is not on the artist menu', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        services: [{ name: 'Knotless Braids' }, { name: 'Nonexistent Service' }],
        providerId: 'cabcdefghijklmnopqrstuvwx',
        scheduledAt: futureISO(),
        lat: 46.49, lng: -80.99,
      });
    expect(res.status).toBe(422);
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it('400s when neither services[] nor a legacy serviceType is supplied', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: 'cabcdefghijklmnopqrstuvwx', scheduledAt: futureISO(), lat: 46.49, lng: -80.99 });
    expect(res.status).toBe(400);
  });

  it('still accepts the legacy single serviceType + hours body and writes one line item', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceType: 'Knotless Braids', hours: 3,
        providerId: 'cabcdefghijklmnopqrstuvwx',
        scheduledAt: futureISO(),
        lat: 46.49, lng: -80.99,
      });
    expect(res.status).toBe(201);
    const data = mockBookingCreate.mock.calls[0][0].data;
    expect(data.serviceType).toBe('Knotless Braids');
    expect(data.services.create).toHaveLength(1);
  });
});
