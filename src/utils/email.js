// src/utils/email.js
'use strict';

/**
 * Sends a password-reset email via Resend. Mirrors src/utils/otp.js's
 * sendSMS pattern: logs the link in dev/when no API key is set, never throws
 * (email delivery is best-effort — the reset token is already valid regardless).
 */
async function sendPasswordResetEmail(email, resetLink) {
  const apiKey = process.env.RESEND_API_KEY;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL] Password reset for ${email} → ${resetLink}`);
  }

  if (!apiKey) {
    console.log('[EMAIL] No RESEND_API_KEY — dev mode, link logged above');
    return;
  }

  try {
    const { Resend } = require('resend');
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from:    process.env.RESEND_FROM_EMAIL || 'Glow <noreply@glow.app>',
      to:      email,
      subject: 'Reset your Glow password',
      html:    `<p>Tap the link below to reset your Glow password. This link expires in 1 hour.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error(`[EMAIL] Resend error for ${email}:`, err.message);
  }
}

module.exports = { sendPasswordResetEmail };
