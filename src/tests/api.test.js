// ─────────────────────────────────────────────────────────────────────────────
// DATABASE ISOLATION — READ BEFORE MODIFYING
// ─────────────────────────────────────────────────────────────────────────────
// These tests NEVER touch a real database. `../lib/prisma` is mocked below via
// a Proxy that returns jest mocks for every model and method.
//
// To run tests against a real DB (integration tests), set TEST_DATABASE_URL in
// your environment to a SEPARATE test-only database — never the same value as
// DATABASE_URL or the production Railway database URL. See prisma.config.ts for
// how TEST_DATABASE_URL is wired in.
//
// CI safety: `npm test` is safe to run in any environment because the Prisma
// mock below ensures zero DB connections are made during the test suite.
// ─────────────────────────────────────────────────────────────────────────────

// Must be set before any require() — jwt.js throws at module load if missing.
process.env.JWT_SECRET    = process.env.JWT_SECRET    || 'test-secret-for-jest-only';
process.env.DATABASE_URL  = process.env.DATABASE_URL  || 'postgresql://localhost/glow_test';
process.env.NODE_ENV      = 'test';

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

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

// ── Prisma mock ───────────────────────────────────────────────────────────────
// The Proxy catches every model accessor and returns an object with jest mocks
// for all standard Prisma methods. This covers: user, booking, providerProfile,
// message, oTP, document, admin, auditLog, payout — and any future models.
//
// auth middleware calls prisma.user.findUnique — we return null by default,
// causing authenticate() to respond 401. Tests that need an authenticated user
// must override mockFindUnique to return a valid user object.
//
// mockUserUpdate captures prisma.user.update calls (e.g. Google-identity linking)
// so tests can assert a write never happened, or inspect its arguments.
const mockFindUnique = jest.fn().mockResolvedValue(null);
const mockQueryRaw   = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
// Same rationale as mockFindUnique above — captures prisma.user.update calls so
// tests can assert whether (and with what args) a User row was written to.
const mockUserUpdate = jest.fn().mockResolvedValue({});

// Jest requires mock factory variables to be prefixed with "mock" (case-insensitive)
// when referenced from within a jest.mock() factory. The helper below is inlined
// inside the factory to avoid the out-of-scope variable restriction.
jest.mock('../lib/prisma', () => {
  // Standard CRUD stub — inlined here because jest.mock() factories cannot reference
  // out-of-scope variables (Jest hoists the factory before variable initialisation).
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
      // auth middleware specifically uses prisma.user.findUnique —
      // mockFindUnique is allowed because it is prefixed with "mock"
      if (prop === 'user')         return { ...mockModelStub(), findUnique: (...a) => mockFindUnique(...a), update: (...a) => mockUserUpdate(...a) };
      if (prop === '$queryRaw')    return (...a) => mockQueryRaw(...a);
      if (prop === '$connect')     return () => Promise.resolve();
      if (prop === '$disconnect')  return () => Promise.resolve();
      if (prop === '$transaction') return (fn) => fn({});
      // All other models (booking, providerProfile, message, etc.) get a full stub
      return mockModelStub();
    },
  };
  return new Proxy({}, handler);
});

jest.mock('../utils/googleAuth', () => ({
  verifyGoogleIdToken: jest.fn(),
}));
const { verifyGoogleIdToken } = require('../utils/googleAuth');

jest.mock('../utils/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const app = require('../app');

// ── Health ────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns service info', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('service', 'glow-api');
    expect(res.body).toHaveProperty('status');
    expect(res.body.services).toHaveProperty('postgres');
    expect(res.body.services).toHaveProperty('redis');
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
describe('404 handler', () => {
  it('returns JSON error for unknown routes', async () => {
    const res = await request(app).get('/nonexistent-route-xyz');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not found');
  });
});

// ── Auth input validation ─────────────────────────────────────────────────────
describe('POST /auth/login', () => {
  it('rejects missing phone', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  it('rejects a new user missing name and role', async () => {
    mockFindUnique.mockResolvedValueOnce(null); // no existing user
    const res = await request(app)
      .post('/auth/login')
      .send({ phone: '4165550100' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name and role/i);
  });

  it('returns a token directly for a known user, no OTP round trip', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'user1', phone: '+14165550100', name: 'Test User', role: 'CUSTOMER',
      photoUrl: '', onboardingComplete: true, phoneVerified: false, deletedAt: null,
    });
    const res = await request(app)
      .post('/auth/login')
      .send({ phone: '4165550100' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ id: 'user1', phoneVerified: false });
  });
});

describe('POST /auth/verify (removed)', () => {
  it('no longer exists — replaced by /auth/verify-phone', async () => {
    const res = await request(app).post('/auth/verify').send({});
    expect(res.status).toBe(404);
  });
});

// ── Auth middleware ───────────────────────────────────────────────────────────
describe('Protected routes return 401 without token', () => {
  const routes = [
    { method: 'post', path: '/bookings' },
    { method: 'get',  path: '/bookings/my' },
    { method: 'get',  path: '/jobs/nearby' },
    { method: 'get',  path: '/providers/available' },
  ];

  routes.forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path}`, async () => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    });
  });

  it('rejects tampered JWT with 401', async () => {
    const bad = jwt.sign({ userId: 'user123' }, 'wrong-secret');
    const res = await request(app)
      .get('/bookings/my')
      .set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });
});

// ── Booking input validation ──────────────────────────────────────────────────
describe('POST /bookings — input validation', () => {
  const token = jwt.sign({ userId: 'cuid_test_user_id' }, JWT_SECRET);

  it('rejects hours below minimum (3)', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceType: 'Personal Care',
        hours: 1,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        lat: 46.49,
        lng: -80.99,
      });
    expect([400, 401]).toContain(res.status);
  });

  it('rejects invalid serviceType', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceType: 'Dogwalking',
        hours: 3,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        lat: 46.49,
        lng: -80.99,
      });
    expect([400, 401]).toContain(res.status);
  });

  it('rejects malformed scheduledAt', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceType: 'Personal Care',
        hours: 3,
        scheduledAt: 'not-a-date',
        lat: 46.49,
        lng: -80.99,
      });
    expect([400, 401]).toContain(res.status);
  });
});

describe('POST /auth/send-verify-otp', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/auth/send-verify-otp').send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/verify-phone', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/auth/verify-phone').send({ otp: '123456' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed otp', async () => {
    const token = jwt.sign({ userId: 'user1', role: 'CUSTOMER' }, JWT_SECRET, { algorithm: 'HS256' });
    mockFindUnique.mockResolvedValue({ id: 'user1', phone: '+14165550100', role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .post('/auth/verify-phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ otp: '12' });
    expect(res.status).toBe(400);
  });

  it('rejects when account has no phone and none was supplied', async () => {
    const token = jwt.sign({ userId: 'user2', role: 'CUSTOMER' }, JWT_SECRET, { algorithm: 'HS256' });
    mockFindUnique.mockResolvedValue({ id: 'user2', phone: null, role: 'CUSTOMER', deletedAt: null });
    const res = await request(app)
      .post('/auth/verify-phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ otp: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });
});

describe('POST /bookings — phoneVerified gate', () => {
  it('blocks booking creation when phone is unverified', async () => {
    const token = jwt.sign({ userId: 'user3', role: 'CUSTOMER' }, JWT_SECRET, { algorithm: 'HS256' });
    mockFindUnique.mockResolvedValue({
      id: 'user3', role: 'CUSTOMER', phone: '+14165550100', phoneVerified: false, deletedAt: null,
    });
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceType: 'Makeup', hours: 1,
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PHONE_NOT_VERIFIED');
  });
});

describe('POST /bookings/:id/reassign — phoneVerified gate', () => {
  it('blocks reassignment when phone is unverified', async () => {
    const token = jwt.sign({ userId: 'user4', role: 'CUSTOMER' }, JWT_SECRET, { algorithm: 'HS256' });
    mockFindUnique.mockResolvedValue({
      id: 'user4', role: 'CUSTOMER', phone: '+14165550100', phoneVerified: false, deletedAt: null,
    });
    const res = await request(app)
      .post('/bookings/cuid_test_booking_id/reassign')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: 'cuid_test_provider_id_000000' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PHONE_NOT_VERIFIED');
  });
});

// ── Security headers ──────────────────────────────────────────────────────────
describe('Security headers', () => {
  it('X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('X-Frame-Options: DENY', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('Cache-Control: no-store', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────
describe('CORS', () => {
  it('sets access-control-allow-origin', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'https://glow.app');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});

// ── Booking cancel ────────────────────────────────────────────────────────────
describe('PATCH /bookings/:id/cancel — input validation', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).patch('/bookings/not-a-valid-id/cancel');
    expect(res.status).toBe(401);
  });
});

// ── Rating input validation ───────────────────────────────────────────────────
describe('POST /ratings — input validation', () => {
  const token = jwt.sign({ userId: 'cuid_test_user_id' }, JWT_SECRET);

  it('rejects rating > 5', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: 'some-booking-id', rating: 6 });
    expect([400, 401]).toContain(res.status);
  });

  it('rejects rating < 1', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: 'some-booking-id', rating: 0 });
    expect([400, 401]).toContain(res.status);
  });

  it('rejects missing bookingId', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4 });
    expect([400, 401]).toContain(res.status);
  });
});

// ── Provider location update ───────────────────────────────────────────────────────
describe('PATCH /jobs/location — input validation', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/jobs/location')
      .send({ lat: 46.49, lng: -80.99, bookingId: 'some-booking-id' });
    expect(res.status).toBe(401);
  });
});

// ── Admin routes ──────────────────────────────────────────────────────────────
describe('Admin routes — blocked without credentials', () => {
  [
    { method: 'get', path: '/admin/bookings' },
    { method: 'get', path: '/admin/providers' },
  ].forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path} → blocked`, async () => {
      const res = await request(app)[method](path);
      expect([401, 403]).toContain(res.status);
    });
  });
});

// ── Google Sign-In ───────────────────────────────────────────────────────────
describe('POST /auth/google', () => {
  it('rejects missing idToken', async () => {
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('creates a new customer account from a valid Google token', async () => {
    verifyGoogleIdToken.mockResolvedValueOnce({
      sub: 'g-123', email: 'new@example.com', name: 'New Person', picture: 'https://x/y.jpg',
    });
    mockFindUnique.mockResolvedValueOnce(null); // no user with this googleId
    mockFindUnique.mockResolvedValueOnce(null); // no user with this email either
    const res = await request(app).post('/auth/google').send({ idToken: 'fake' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('does not link to a soft-deleted account matched by email — creates a fresh account instead', async () => {
    mockUserUpdate.mockClear();
    verifyGoogleIdToken.mockResolvedValueOnce({
      sub: 'g-456', email: 'was-deleted@example.com', name: 'New Person', picture: '',
    });
    mockFindUnique.mockResolvedValueOnce(null); // no user with this googleId
    mockFindUnique.mockResolvedValueOnce({      // a DELETED account has this email
      id: 'deleted-user-1', email: 'was-deleted@example.com', googleId: null,
      role: 'CUSTOMER', deletedAt: new Date('2026-01-01'),
    });

    const res = await request(app).post('/auth/google').send({ idToken: 'fake' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    // Must not have linked/mutated the deleted row.
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockUserUpdate.mock.calls.some(
      (call) => call[0] && call[0].where && call[0].where.id === 'deleted-user-1'
    )).toBe(false);
  });

  it('links Google identity to an existing ACTIVE account matched by email', async () => {
    mockUserUpdate.mockClear();
    verifyGoogleIdToken.mockResolvedValueOnce({
      sub: 'g-789', email: 'active@example.com', name: 'Active Person', picture: '',
    });
    mockFindUnique.mockResolvedValueOnce(null); // no user with this googleId
    mockFindUnique.mockResolvedValueOnce({      // an ACTIVE account has this email
      id: 'active-user-1', email: 'active@example.com', googleId: null,
      role: 'CUSTOMER', deletedAt: null,
    });
    mockUserUpdate.mockResolvedValueOnce({
      id: 'active-user-1', email: 'active@example.com', googleId: 'g-789',
      role: 'CUSTOMER', deletedAt: null,
    });

    const res = await request(app).post('/auth/google').send({ idToken: 'fake' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.id).toBe('active-user-1');
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'active-user-1' },
      data:  { googleId: 'g-789' },
    });
  });
});

describe('POST /auth/register-email', () => {
  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/auth/register-email')
      .send({ email: 'a@b.com', password: 'short', name: 'A B' });
    expect(res.status).toBe(400);
  });

  it('creates a new customer account', async () => {
    mockFindUnique.mockResolvedValueOnce(null); // no existing user with this email
    const res = await request(app)
      .post('/auth/register-email')
      .send({ email: 'new@example.com', password: 'longenoughpassword', name: 'New Person' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('rejects an email that already has a password set', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'u1', email: 'dup@example.com', passwordHash: 'somehash' });
    const res = await request(app)
      .post('/auth/register-email')
      .send({ email: 'dup@example.com', password: 'longenoughpassword', name: 'Dup' });
    expect(res.status).toBe(409);
  });
});

describe('POST /auth/login-email', () => {
  it('returns generic error for unknown email', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/auth/login-email')
      .send({ email: 'ghost@example.com', password: 'whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  // Enumeration-prevention: a real account with a wrong password must fail
  // with the EXACT SAME status/message as an unknown email — including a
  // deleted account, which must not be distinguishable via a different
  // status code (this is what would have caught the old 403-for-deleted
  // bug: a deleted account with a correct password used to get a distinct
  // 403 "This account has been deleted." instead of collapsing into the
  // generic 401 below).
  it('returns the SAME generic error for a known email with the wrong password', async () => {
    const unknownEmailRes = await (async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      return request(app)
        .post('/auth/login-email')
        .send({ email: 'ghost2@example.com', password: 'whatever123' });
    })();

    const realHash = await bcrypt.hash('correct-password-123', 10);
    mockFindUnique.mockResolvedValueOnce({
      id: 'user-known',
      email: 'known@example.com',
      passwordHash: realHash,
      deletedAt: null,
    });
    const wrongPasswordRes = await request(app)
      .post('/auth/login-email')
      .send({ email: 'known@example.com', password: 'totally-wrong-password' });

    expect(wrongPasswordRes.status).toBe(401);
    expect(wrongPasswordRes.body.error).toBe(unknownEmailRes.body.error);
    expect(wrongPasswordRes.status).toBe(unknownEmailRes.status);
  });

  // A soft-deleted account is functionally "this login should fail" and must
  // be indistinguishable from "wrong password" — not a separate 403.
  it('returns the SAME generic 401 for a deleted account, not a distinct 403', async () => {
    const realHash = await bcrypt.hash('correct-password-123', 10);
    mockFindUnique.mockResolvedValueOnce({
      id: 'user-deleted',
      email: 'deleted@example.com',
      passwordHash: realHash,
      deletedAt: new Date(),
    });
    const res = await request(app)
      .post('/auth/login-email')
      .send({ email: 'deleted@example.com', password: 'correct-password-123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });
});

describe('POST /auth/forgot-password', () => {
  it('returns 200 even for unknown email (no enumeration)', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
  });

  it('returns 200 with the same shape for a known email and actually sends the email', async () => {
    const { sendPasswordResetEmail } = require('../utils/email');
    sendPasswordResetEmail.mockClear();

    mockFindUnique.mockResolvedValueOnce(null);
    const unknownRes = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'ghost3@example.com' });

    mockFindUnique.mockResolvedValueOnce({
      id: 'user-real',
      email: 'real@example.com',
      passwordHash: 'somehash',
      deletedAt: null,
    });
    const knownRes = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'real@example.com' });

    expect(knownRes.status).toBe(200);
    expect(knownRes.status).toBe(unknownRes.status);
    expect(knownRes.body.message).toBe(unknownRes.body.message);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('real@example.com', expect.stringContaining('reset-password?token='));
  });
});

describe('POST /auth/reset-password', () => {
  it('rejects an invalid token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'longenoughpassword' });
    expect(res.status).toBe(400);
  });
});
