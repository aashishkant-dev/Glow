// src/utils/smsProviders/index.js
// Routes OTP SMS delivery to the right provider by the phone's country code.
// Canada/USA use Twilio (already provisioned). Nepal (+977) doesn't have a
// provider wired up yet — falls back to Twilio's no-credentials dev-log path
// so a Nepali OTP is never silently dropped, just not actually sent until a
// real Nepal SMS provider (e.g. Sparrow SMS) is integrated here.
'use strict';

const { sendViaTwilio } = require('./twilio');

/**
 * Sends an OTP SMS via the provider appropriate for the phone number's country
 * code. Never throws — same best-effort contract as the individual providers.
 */
async function sendOTPSms(phone, otp) {
  if (phone.startsWith('+977')) {
    // TODO: wire up a real Nepal SMS provider here once one is chosen/provisioned.
    // Falling through to Twilio is intentional — it has no NP-specific credentials,
    // so it just logs the OTP in dev/LOG_OTP mode rather than pretending to send.
    console.log('[SMS] +977 (Nepal) — no dedicated provider configured yet, falling back to dev log');
    return sendViaTwilio(phone, otp);
  }

  // Default: Twilio covers Canada and USA (same North American account).
  return sendViaTwilio(phone, otp);
}

module.exports = { sendOTPSms };
