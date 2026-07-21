// src/utils/smsProviders/twilio.js
'use strict';

/**
 * Sends an OTP SMS via Twilio. Used for Canada (and USA, once launched — same
 * Twilio account covers North America without a separate provider).
 * Never throws — SMS delivery is best-effort; the OTP is already persisted by
 * the caller, so a delivery failure here doesn't invalidate the code.
 */
async function sendViaTwilio(phone, otp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.log(`[SMS:twilio] No Twilio credentials — dev mode, OTP logged by caller`);
    return;
  }

  try {
    const twilio = require('twilio')(accountSid, authToken);
    await twilio.messages.create({
      body: `Your Glow verification code is: ${otp}\n\nValid for 5 minutes. Do not share this code.\n\nGlow Beauty`,
      from,
      to: phone,
    });
    if (process.env.NODE_ENV !== 'production') console.log(`[SMS:twilio] Sent to ${phone}`);
  } catch (err) {
    console.error(`[SMS:twilio] error for ${phone} — code: ${err.code} status: ${err.status} msg: ${err.message}`);
  }
}

module.exports = { sendViaTwilio };
