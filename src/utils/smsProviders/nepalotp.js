// src/utils/smsProviders/nepalotp.js
'use strict';

// NepalOTP (nepalotp.com) is not a blind SMS transport like Twilio — it
// generates and stores the OTP itself, and verification is a separate API
// call against their service, not a local bcrypt compare. So unlike Twilio,
// this file owns both send AND verify; src/utils/otp.js delegates the whole
// generate/verify cycle to it for +977 numbers instead of just the SMS leg.
const API_BASE = 'https://api.nepalotp.com/v1';

function getApiKey() {
  return process.env.NEPALOTP_API_KEY;
}

/**
 * Requests an OTP send from NepalOTP. Returns their opaque request id (needed
 * later to verify), or null if delivery couldn't be requested (missing
 * credentials, network/API error) — caller falls back to dev-log behavior.
 * Never throws — same best-effort contract as the Twilio provider.
 */
async function sendViaNepalOTP(phone) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[SMS:nepalotp] No NEPALOTP_API_KEY — dev mode, OTP not actually sent');
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}/otp/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, channel: 'sms' }),
    });
    const data = await res.json();
    if (!res.ok || !data.id) {
      console.error(`[SMS:nepalotp] send failed for ${phone} — status: ${res.status} body: ${JSON.stringify(data)}`);
      return null;
    }
    if (process.env.NODE_ENV !== 'production') console.log(`[SMS:nepalotp] Sent to ${phone}, request id ${data.id}`);
    return data.id;
  } catch (err) {
    console.error(`[SMS:nepalotp] error sending to ${phone}:`, err.message);
    return null;
  }
}

/**
 * Verifies a code against NepalOTP's own verification endpoint (the code
 * itself is never known to or checked by our backend for +977 numbers).
 * Returns { valid: true } or { valid: false, error }.
 */
async function verifyViaNepalOTP(phone, code) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { valid: false, error: 'OTP verification is temporarily unavailable. Please try again shortly.' };
  }

  try {
    const res = await fetch(`${API_BASE}/otp/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, code }),
    });
    const data = await res.json();
    if (res.ok && data.status === 'verified') return { valid: true };
    if (res.status === 429) return { valid: false, error: 'Too many attempts. Please request a new OTP.' };
    return { valid: false, error: 'Invalid OTP. Please check the code and try again.' };
  } catch (err) {
    console.error(`[SMS:nepalotp] error verifying for ${phone}:`, err.message);
    return { valid: false, error: 'Could not verify code right now. Please try again.' };
  }
}

module.exports = { sendViaNepalOTP, verifyViaNepalOTP };
