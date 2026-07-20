process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test-secret-for-jest-only';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/glow_test';
process.env.GOOGLE_CLIENT_ID_WEB = 'test-client-id.apps.googleusercontent.com';

jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-123',
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/photo.jpg',
        }),
      }),
    })),
  };
});

const { verifyGoogleIdToken } = require('../utils/googleAuth');

describe('verifyGoogleIdToken', () => {
  it('returns the decoded payload fields', async () => {
    const result = await verifyGoogleIdToken('fake-id-token');
    expect(result).toEqual({
      sub: 'google-user-123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    });
  });
});

describe('verifyGoogleIdToken — email normalization', () => {
  it('lowercases and trims a mixed-case email from the Google payload', async () => {
    // googleAuth.js constructs a single module-level `OAuth2Client` instance at
    // require time, so mocking the constructor here wouldn't reach the already-
    // created instance. Instead, override its `verifyIdToken` for this call —
    // the mock factory above returns the same instance from every `new OAuth2Client()`
    // call site, and this is the one googleAuth.js itself is holding.
    const { OAuth2Client } = require('google-auth-library');
    const instance = OAuth2Client.mock.results[0].value;
    instance.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-user-456',
        email: 'Test@Example.COM',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      }),
    });

    const result = await verifyGoogleIdToken('fake-id-token-mixed-case');
    expect(result.email).toBe('test@example.com');
  });
});
