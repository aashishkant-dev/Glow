// src/utils/smsProviders/index.js
// Routes OTP SMS delivery for countries that use OUR OWN generated code
// (Canada/USA/UK via Twilio, a blind SMS transport). Nepal (+977) is handled
// entirely separately in src/utils/otp.js, which delegates the whole
// generate+verify cycle to NepalOTP (src/utils/smsProviders/nepalotp.js)
// before ever reaching this file — NepalOTP generates its own code, so
// there's no "OTP we generated" to send through a transport here.
'use strict';

const { sendViaTwilio } = require('./twilio');

/**
 * Sends an OTP SMS via the provider appropriate for the phone number's country
 * code. Never throws — same best-effort contract as the individual providers.
 */
async function sendOTPSms(phone, otp) {
  // Twilio covers Canada/USA (North American number) and UK (separate sender
  // number — see sendViaTwilio's country check).
  return sendViaTwilio(phone, otp);
}

module.exports = { sendOTPSms };
