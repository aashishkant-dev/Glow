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
