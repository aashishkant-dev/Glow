// src/utils/smsProviders/twilioVerify.js
'use strict';

// Twilio Verify owns both generation AND verification for +44 numbers —
// same delegation shape as NepalOTP (src/utils/smsProviders/nepalotp.js).
// UK carriers filter/require registration for SMS sent from a purchased
// long-code number, which is a slow compliance process; Verify sends from
// Twilio's own shared/managed senders and needs no dedicated UK number, so
// it's the fast path to get +44 OTP delivery working.
function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken   = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return require('twilio')(accountSid, authToken);
}

function getServiceSid() {
  return process.env.TWILIO_VERIFY_SERVICE_SID;
}

/**
 * Requests an OTP send via Twilio Verify. Returns true if the request was
 * accepted, or false if it couldn't be sent (missing credentials, network/API
 * error) — caller falls back to dev-log behavior. Never throws — same
 * best-effort contract as the other SMS providers.
 */
async function sendViaTwilioVerify(phone) {
  const client = getClient();
  const serviceSid = getServiceSid();
  if (!client || !serviceSid) {
    console.log('[SMS:twilioVerify] Missing Twilio credentials or TWILIO_VERIFY_SERVICE_SID — dev mode, OTP not actually sent');
    return false;
  }

  try {
    const verification = await client.verify.v2.services(serviceSid)
      .verifications.create({ to: phone, channel: 'sms' });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SMS:twilioVerify] Sent to ${phone}, status ${verification.status}`);
    }
    return true;
  } catch (err) {
    console.error(`[SMS:twilioVerify] send failed for ${phone} — code: ${err.code} status: ${err.status} msg: ${err.message}`);
    return false;
  }
}

/**
 * Verifies a code against Twilio Verify's own check endpoint (the code itself
 * is never known to or checked by our backend for +44 numbers — Twilio owns
 * it end to end, same as NepalOTP).
 * Returns { valid: true } or { valid: false, error }.
 */
async function verifyViaTwilioVerify(phone, code) {
  const client = getClient();
  const serviceSid = getServiceSid();
  if (!client || !serviceSid) {
    return { valid: false, error: 'OTP verification is temporarily unavailable. Please try again shortly.' };
  }

  try {
    const check = await client.verify.v2.services(serviceSid)
      .verificationChecks.create({ to: phone, code });
    if (check.status === 'approved') return { valid: true };
    return { valid: false, error: 'Invalid OTP. Please try again.' };
  } catch (err) {
    // Twilio throws (rather than returning a non-approved status) for an
    // expired/already-checked verification — surface as an expiry, not a
    // generic failure, since that's the far more common real-world cause.
    console.error(`[SMS:twilioVerify] check failed for ${phone} — code: ${err.code} status: ${err.status} msg: ${err.message}`);
    return { valid: false, error: 'OTP expired. Please request a new one.' };
  }
}

module.exports = { sendViaTwilioVerify, verifyViaTwilioVerify };
