// src/tests/hourlyArtistBooking.test.js
// Same DB-isolation strategy as multiServiceBooking.test.js: `../lib/prisma` is
// fully mocked via a Proxy, so these tests never touch a real database.
//
// Covers the HOURLY pricing model, which is the DEFAULT for ProviderProfile
// (prisma/schema.prisma) and — at the time of writing — the model used by every
// approved artist in the dev database. An HOURLY artist has no ProviderService
// menu rows at all, so menu-only resolution makes them entirely unbookable.

process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test-secret-for-jest-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/glow_test';
process.env.NODE_ENV     = 'test';

// Per-test control over what the mocked profile lookup returns.
const state = {
  profile: null,
  menu: [],
};

jest.mock('../lib/prisma', () => {
  const handler = {
    get(_target, prop) {
      if (prop === 'providerProfile') {
        return { findUnique: jest.fn(() => Promise.resolve(state.profile)) };
      }
      if (prop === 'providerService') {
        return { findMany: jest.fn(() => Promise.resolve(state.menu)) };
      }
      return {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst:  jest.fn().mockResolvedValue(null),
        findMany:   jest.fn().mockResolvedValue([]),
        create:     jest.fn().mockResolvedValue({}),
      };
    },
  };
  return new Proxy({}, handler);
});

const { resolveBookingServices } = require('../utils/bookingServices');

// Decimal-mock convention used throughout this codebase's tests.
const dec = v => ({ toString: () => v });

beforeEach(() => {
  state.profile = null;
  state.menu = [];
});

describe('resolveBookingServices — HOURLY artists', () => {
  it('prices a single service at the artist hourly rate for one hour', async () => {
    state.profile = { pricingModel: 'HOURLY', hourlyRate: dec('50.00') };

    const result = await resolveBookingServices([{ name: 'Makeup' }], 'artistHourly');

    expect(result.lines).toEqual([
      { serviceItemId: null, name: 'Makeup', price: 50, durationMin: 60 },
    ]);
    expect(result.listedTotal).toBe(50);
    expect(result.totalDurationMin).toBe(60);
    expect(result.summaryServiceType).toBe('Makeup');
    expect(result.summaryHours).toBe(1);
  });

  it('allows multi-select for an HOURLY artist, billing each line as one hour', async () => {
    state.profile = { pricingModel: 'HOURLY', hourlyRate: dec('50.00') };

    const result = await resolveBookingServices(
      [{ name: 'Makeup' }, { name: 'Hair Styling' }],
      'artistHourly',
    );

    expect(result.lines).toEqual([
      { serviceItemId: null, name: 'Makeup',       price: 50, durationMin: 60 },
      { serviceItemId: null, name: 'Hair Styling', price: 50, durationMin: 60 },
    ]);
    expect(result.listedTotal).toBe(100);
    expect(result.totalDurationMin).toBe(120);
    expect(result.summaryServiceType).toBe('Makeup +1 more');
    expect(result.summaryHours).toBe(2);
  });

  it('does NOT consult the ProviderService menu for an HOURLY artist', async () => {
    // An HOURLY artist may have stale/no menu rows; the hourly rate is the
    // single source of truth for their price.
    state.profile = { pricingModel: 'HOURLY', hourlyRate: dec('75.50') };
    state.menu = [{ serviceItemId: 'x', name: 'Makeup', price: dec('999.00'), durationMin: 30 }];

    const result = await resolveBookingServices([{ name: 'Makeup' }], 'artistHourly');

    expect(result.listedTotal).toBe(75.5);
    expect(result.lines[0].durationMin).toBe(60);
  });

  it('deduplicates a repeated service rather than double-charging', async () => {
    state.profile = { pricingModel: 'HOURLY', hourlyRate: dec('50.00') };

    const result = await resolveBookingServices(
      [{ name: 'Makeup' }, { name: 'Makeup' }],
      'artistHourly',
    );

    expect(result.lines).toHaveLength(1);
    expect(result.listedTotal).toBe(50);
  });

  it('throws 422 when an HOURLY artist has not set an hourly rate', async () => {
    state.profile = { pricingModel: 'HOURLY', hourlyRate: null };

    await expect(resolveBookingServices([{ name: 'Makeup' }], 'artistHourly'))
      .rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 when an HOURLY artist hourly rate is zero', async () => {
    state.profile = { pricingModel: 'HOURLY', hourlyRate: dec('0.00') };

    await expect(resolveBookingServices([{ name: 'Makeup' }], 'artistHourly'))
      .rejects.toMatchObject({ status: 422 });
  });

  it('treats a missing profile as unbookable rather than free', async () => {
    state.profile = null;

    await expect(resolveBookingServices([{ name: 'Makeup' }], 'ghost'))
      .rejects.toMatchObject({ status: 422 });
  });

  it('still resolves PER_SERVICE artists against their menu, unchanged', async () => {
    state.profile = { pricingModel: 'PER_SERVICE', hourlyRate: dec('50.00') };
    state.menu = [
      { serviceItemId: 'item_braids', name: 'Knotless Braids', price: dec('120.00'), durationMin: 150 },
    ];

    const result = await resolveBookingServices([{ name: 'Knotless Braids' }], 'artistMenu');

    expect(result.lines).toEqual([
      { serviceItemId: 'item_braids', name: 'Knotless Braids', price: 120, durationMin: 150 },
    ]);
    expect(result.listedTotal).toBe(120);
  });

  it('still 422s a PER_SERVICE artist when a requested service is off-menu', async () => {
    state.profile = { pricingModel: 'PER_SERVICE', hourlyRate: dec('50.00') };
    state.menu = [];

    await expect(resolveBookingServices([{ name: 'Underwater Basket Weaving' }], 'artistMenu'))
      .rejects.toMatchObject({ status: 422 });
  });
});
