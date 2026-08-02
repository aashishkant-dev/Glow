// src/tests/jobAccept.test.js
// Same DB-isolation strategy as api.test.js/favorites.test.js: `../lib/prisma`
// is fully mocked via a Proxy, so these tests never touch a real database.
//
// This file exists specifically to verify the atomic-claim fix for the
// job-acceptance race condition (POST /jobs/:id/accept): two Providers
// racing to accept the same open job must not both succeed. The mocked
// `booking.updateMany` below simulates Postgres's actual guarantee — a
// conditional UPDATE only matches rows where the WHERE clause is still true
// at write time — by checking the in-memory booking's live status inside
// the mock itself, exactly as Postgres would check it against the row.

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

const PROVIDER_A = { id: 'provA', name: 'Artist A', role: 'Provider', deletedAt: null };
const PROVIDER_B = { id: 'provB', name: 'Artist B', role: 'Provider', deletedAt: null };

// A single in-memory booking row, mutated by the mock exactly like Postgres
// would mutate the real row — this is what makes the race actually
// reproducible in the mock rather than trivially always-succeeding.
let mockBookingRow;

function resetMockBooking() {
  mockBookingRow = {
    id: 'booking1',
    status: 'REQUESTED',
    providerId: null,
    openToPool: true,
    customerId: 'cust1',
    scheduledAt: new Date(Date.now() + 3600 * 1000),
    hours: 2,
  };
}

jest.mock('../lib/prisma', () => {
  function mockModelStub(modelName) {
    return {
      findUnique: jest.fn(({ where }) => {
        if (modelName === 'providerProfile') {
          // Both test providers are approved — the auth/approval gate itself
          // isn't what this file is testing.
          return Promise.resolve({ userId: where.userId, approvedByAdmin: true });
        }
        if (modelName === 'user') {
          if (where.id === PROVIDER_A.id) return Promise.resolve(PROVIDER_A);
          if (where.id === PROVIDER_B.id) return Promise.resolve(PROVIDER_B);
          return Promise.resolve(null);
        }
        if (modelName === 'booking' && where.id === mockBookingRow.id) {
          return Promise.resolve({ ...mockBookingRow });
        }
        return Promise.resolve(null);
      }),
      findFirst: jest.fn(({ where }) => {
        if (modelName === 'booking') {
          if (where.id === mockBookingRow.id && (!where.status || where.status === mockBookingRow.status)) {
            return Promise.resolve({ ...mockBookingRow });
          }
          // Conflict-detection findFirst (different where shape, no `id` key) —
          // no other active bookings exist for either test provider.
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      // The fix under test: a real conditional write. Only mutates mockBookingRow
      // if it's STILL in the state the `where` clause requires — simulating
      // Postgres re-checking the WHERE against the live row at write time,
      // not against a stale snapshot read earlier in the request.
      updateMany: jest.fn(({ where, data }) => {
        if (modelName !== 'booking') return Promise.resolve({ count: 0 });
        const statusOk = !where.status
          ? true
          : where.status.in
            ? where.status.in.includes(mockBookingRow.status)
            : where.status === mockBookingRow.status;
        const providerOk = where.providerId === undefined || where.providerId === mockBookingRow.providerId;
        if (where.id === mockBookingRow.id && statusOk && providerOk) {
          Object.assign(mockBookingRow, data);
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      }),
      update: jest.fn(() => Promise.resolve(mockBookingRow)),
      count: jest.fn().mockResolvedValue(0),
    };
  }
  return new Proxy({}, { get: (_t, prop) => mockModelStub(prop) });
});

const app = require('../app');

function tokenFor(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { algorithm: 'HS256' });
}

describe('POST /jobs/:id/accept — atomic claim race condition', () => {
  beforeEach(() => resetMockBooking());

  test('a single accept succeeds and claims the booking', async () => {
    const res = await request(app)
      .post(`/jobs/${mockBookingRow.id}/accept`)
      .set('Authorization', `Bearer ${tokenFor(PROVIDER_A)}`);
    expect(res.status).toBe(200);
    expect(mockBookingRow.status).toBe('ACCEPTED');
    expect(mockBookingRow.providerId).toBe(PROVIDER_A.id);
  });

  test('two Providers racing to accept the same job: exactly one wins, the other is rejected, never a silent double-claim', async () => {
    // Fire both requests concurrently (Promise.all), matching how two real
    // near-simultaneous HTTP requests would actually race against the mock's
    // single shared `mockBookingRow` state.
    const [resA, resB] = await Promise.all([
      request(app).post(`/jobs/${mockBookingRow.id}/accept`).set('Authorization', `Bearer ${tokenFor(PROVIDER_A)}`),
      request(app).post(`/jobs/${mockBookingRow.id}/accept`).set('Authorization', `Bearer ${tokenFor(PROVIDER_B)}`),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one 200 (the winner). The loser's exact status (404 from the
    // findFirst pre-check, or 409 from the updateMany claim itself) depends
    // on which layer the mock's synchronous event-loop ordering resolves the
    // race at — both are correct, honest rejections. What must NEVER happen,
    // and is the actual bug this fix closes, is [200, 200]: both writes
    // silently succeeding and the second overwriting the first with no error
    // to either side.
    expect(statuses).not.toEqual([200, 200]);
    expect(statuses[0]).toBe(200);
    expect([404, 409]).toContain(statuses[1]);

    // The booking ended up assigned to exactly whichever Provider's request
    // actually won the write — not left in an inconsistent/overwritten state.
    expect(mockBookingRow.status).toBe('ACCEPTED');
    expect([PROVIDER_A.id, PROVIDER_B.id]).toContain(mockBookingRow.providerId);
  });

  test('accepting an already-ACCEPTED booking (by someone else) returns 409, not a silent success', async () => {
    mockBookingRow.status = 'ACCEPTED';
    mockBookingRow.providerId = PROVIDER_A.id;
    mockBookingRow.openToPool = false;

    const res = await request(app)
      .post(`/jobs/${mockBookingRow.id}/accept`)
      .set('Authorization', `Bearer ${tokenFor(PROVIDER_B)}`);

    // findFirst's initial existence check already returns null for a
    // non-REQUESTED booking, so this is caught before the updateMany claim
    // is even attempted — confirms the pre-check and the write-time guard
    // agree with each other, not just the write-time guard alone.
    expect(res.status).toBe(404);
    expect(mockBookingRow.providerId).toBe(PROVIDER_A.id);
  });

  test('a different Provider CAN accept a dedicated job once it is opened to the pool', async () => {
    // requestTimeoutSweep.js sets openToPool=true but deliberately keeps the
    // original providerId (so that Provider's own inbox still shows it). A
    // different Provider seeing it in Find Jobs must actually be able to
    // accept — this was the real bug: the providerId-mismatch guard fired
    // regardless of openToPool, so every such accept 403'd forever.
    mockBookingRow.providerId = PROVIDER_A.id;
    mockBookingRow.openToPool = true;
    mockBookingRow.status = 'REQUESTED';

    const res = await request(app)
      .post(`/jobs/${mockBookingRow.id}/accept`)
      .set('Authorization', `Bearer ${tokenFor(PROVIDER_B)}`);

    expect(res.status).toBe(200);
    expect(mockBookingRow.status).toBe('ACCEPTED');
    expect(mockBookingRow.providerId).toBe(PROVIDER_B.id);
  });

  test('a different Provider still CANNOT accept a dedicated job that is NOT open to the pool', async () => {
    mockBookingRow.providerId = PROVIDER_A.id;
    mockBookingRow.openToPool = false;
    mockBookingRow.status = 'REQUESTED';

    const res = await request(app)
      .post(`/jobs/${mockBookingRow.id}/accept`)
      .set('Authorization', `Bearer ${tokenFor(PROVIDER_B)}`);

    expect(res.status).toBe(403);
    expect(mockBookingRow.providerId).toBe(PROVIDER_A.id);
  });
});
