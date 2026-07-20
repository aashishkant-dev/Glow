process.env.JWT_SECRET     = process.env.JWT_SECRET     || 'test-secret-for-jest-only';
process.env.DATABASE_URL   = process.env.DATABASE_URL   || 'postgresql://localhost/glow_test';
process.env.RESEND_API_KEY = 'test-key';

const mockSend = jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

const { sendPasswordResetEmail } = require('../utils/email');

describe('sendPasswordResetEmail', () => {
  it('sends via Resend with the reset link in the body', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://glow-app-omega.vercel.app/reset?token=abc');
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      subject: expect.stringMatching(/reset/i),
    }));
    const call = mockSend.mock.calls[0][0];
    expect(call.html).toContain('https://glow-app-omega.vercel.app/reset?token=abc');
  });

  it('does not throw if Resend has no API key configured (dev mode)', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendPasswordResetEmail('user@example.com', 'https://x/reset?token=abc')).resolves.not.toThrow();
    process.env.RESEND_API_KEY = 'test-key';
  });
});
