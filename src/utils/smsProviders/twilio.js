// src/utils/smsProviders/twilio.js
'use strict';

/**
 * Sends an OTP SMS via Twilio. Used for Canada/USA (North American account)
 * and the UK (a separate sender number/ID — UK carriers filter international
 * SMS from a NANP long-code, so the NA number can't be reused for +44).
 * Never throws — SMS delivery is best-effort; the OTP is already persisted by
 * the caller, so a delivery failure here doesn't invalidate the code.
 */
async function sendViaTwilio(phone, otp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  const isUK = phone.startsWith('+44');
  let from = isUK ? process.env.TWILIO_UK_PHONE_NUMBER : process.env.TWILIO_PHONE_NUMBER;
  if (isUK && !from) {
    // No UK sender provisioned yet — fall back to the NA number rather than
    // silently dropping the message, even though delivery to +44 from a NANP
    // long-code is unreliable. Logged loudly so it's visible in Railway logs.
    console.warn('[SMS:twilio] TWILIO_UK_PHONE_NUMBER not set — falling back to TWILIO_PHONE_NUMBER for a UK number. Delivery may be unreliable/blocked.');
    from = process.env.TWILIO_PHONE_NUMBER;
  }

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
