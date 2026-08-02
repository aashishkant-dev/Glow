// src/tests/multiServiceBooking.test.js
// Same DB-isolation strategy as api.test.js/jobAccept.test.js: `../lib/prisma`
// is fully mocked via a Proxy, so these tests never touch a real database.

process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test-secret-for-jest-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/glow_test';
process.env.NODE_ENV     = 'test';

jest.mock('../lib/prisma', () => {
  const handler = {
    get(_target, prop) {
      // These fixtures describe an artist with a real service menu, which
      // means pricingModel PER_SERVICE — resolveBookingServices branches on it.
      if (prop === 'providerProfile') {
        return {
          findUnique: jest.fn(() => Promise.resolve({
            pricingModel: 'PER_SERVICE',
            hourlyRate:   { toString: () => '50.00' },
          })),
        };
      }
      if (prop === 'providerService') {
        return {
          findMany: jest.fn(() => Promise.resolve([
            { serviceItemId: 'item_braids', name: 'Knotless Braids',  price: { toString: () => '120.00' }, durationMin: 150 },
            { serviceItemId: 'item_brows',  name: 'Eyebrow Threading', price: { toString: () => '15.00'  }, durationMin: 15  },
            { serviceItemId: null,          name: 'Hair Styling',      price: { toString: () => '40.00'  }, durationMin: 30  },
          ])),
        };
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

const {
  resolveBookingServices,
  summarizeServiceType,
  hoursFromDurationMin,
} = require('../utils/bookingServices');

describe('summarizeServiceType', () => {
  it('returns the single name unchanged for one service', () => {
    expect(summarizeServiceType(['Knotless Braids'])).toBe('Knotless Braids');
  });

  it('appends "+N more" for multiple services', () => {
    expect(summarizeServiceType(['Knotless Braids', 'Eyebrow Threading', 'Hair Styling']))
      .toBe('Knotless Braids +2 more');
  });
});

describe('hoursFromDurationMin', () => {
  it('rounds up a partial hour', () => {
    expect(hoursFromDurationMin(195)).toBe(4); // 3h15m -> 4
  });

  it('never returns less than 1', () => {
    expect(hoursFromDurationMin(15)).toBe(1);
  });

  it('caps at 12 to satisfy the Booking.hours validator range', () => {
    expect(hoursFromDurationMin(60 * 20)).toBe(12);
  });
});

describe('resolveBookingServices', () => {
  it('resolves every requested service against the artist menu and sums the totals', async () => {
    const result = await resolveBookingServices(
      [{ name: 'Knotless Braids' }, { name: 'Eyebrow Threading' }, { name: 'Hair Styling' }],
      'artist1',
    );
    expect(result.lines).toEqual([
      { serviceItemId: 'item_braids', name: 'Knotless Braids',   price: 120, durationMin: 150 },
      { serviceItemId: 'item_brows',  name: 'Eyebrow Threading', price: 15,  durationMin: 15  },
      { serviceItemId: null,          name: 'Hair Styling',      price: 40,  durationMin: 30  },
    ]);
    expect(result.listedTotal).toBe(175);
    expect(result.totalDurationMin).toBe(195);
    expect(result.summaryServiceType).toBe('Knotless Braids +2 more');
    expect(result.summaryHours).toBe(4);
  });

  it('resolves a single-service booking to exactly one line with an unsuffixed summary', async () => {
    const result = await resolveBookingServices([{ name: 'Hair Styling' }], 'artist1');
    expect(result.lines).toHaveLength(1);
    expect(result.listedTotal).toBe(40);
    expect(result.summaryServiceType).toBe('Hair Styling');
    expect(result.summaryHours).toBe(1);
  });

  it('throws 422 when any requested service is not on the artist menu — never partial-prices', async () => {
    await expect(
      resolveBookingServices([{ name: 'Knotless Braids' }, { name: 'Underwater Basket Weaving' }], 'artist1'),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws 422 for an empty service list', async () => {
    await expect(resolveBookingServices([], 'artist1')).rejects.toMatchObject({ status: 422 });
  });

  it('deduplicates a service requested twice rather than double-charging', async () => {
    const result = await resolveBookingServices(
      [{ name: 'Hair Styling' }, { name: 'Hair Styling' }],
      'artist1',
    );
    expect(result.lines).toHaveLength(1);
    expect(result.listedTotal).toBe(40);
  });
});
