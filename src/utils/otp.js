// src/utils/otp.js
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const MAX_ATTEMPTS = 5;

function getTTLMs() {
  return (parseInt(process.env.OTP_TTL_MINUTES, 10) || 5) * 60 * 1000;
}

/**
 * Send OTP via Twilio SMS if credentials are configured.
 * Falls back to console.log in dev mode.
 * NEVER throws — SMS delivery is best-effort; the OTP is already saved in DB
 * and logged to console so Railway logs always have it for dev/support use.
 */
async function sendSMS(phone, otp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_PHONE_NUMBER;

  // OTP is logged in dev always; in production ONLY while LOG_OTP=1 is set.
  // ⚠️ LOG_OTP=1 puts live login codes for EVERY user in Railway logs — anyone
  // with log access can take over any account. Use for launch testing only,
  // then delete the variable.
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_OTP === '1') {
    console.log(`[OTP] ${phone} → ${otp}`);
  }

  if (!accountSid || !authToken || !from) {
    console.log(`[SMS] No Twilio credentials — dev mode, OTP logged above`);
    return;
  }

  try {
    const twilio = require('twilio')(accountSid, authToken);
    await twilio.messages.create({
      body: `Your Glow verification code is: ${otp}\n\nValid for 5 minutes. Do not share this code.\n\nGlow Beauty`,
      from,
      to: phone,
    });
    if (process.env.NODE_ENV !== 'production') console.log(`[SMS] Sent to ${phone}`);
  } catch (err) {
    // SMS failed — OTP is still valid in DB, always log it here too for Railway support
    console.error(`[SMS] Twilio error for ${phone} — code: ${err.code} status: ${err.status} msg: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') console.log(`[SMS] OTP still valid, use code above to authenticate`);
    // Do NOT throw — caller gets success, user can ask for the code via support if needed
  }
}

/**
 * Generate and store a 6-digit OTP for the given phone number.
 * Replaces any existing OTP for that phone, then sends via SMS.
 */
async function generateOTP(phone) {
  const otp            = crypto.randomInt(100_000, 1_000_000).toString();
  const otpHash        = await bcrypt.hash(otp, 10);
  const expiresAt      = new Date(Date.now() + getTTLMs());
  const cooldownCutoff = new Date(Date.now() - 30_000);
  const now            = new Date();

  // Check for existing OTP (cooldown enforcement)
  const existing = await prisma.oTP.findUnique({ where: { phone } });

  if (existing) {
    if (existing.lastGeneratedAt && existing.lastGeneratedAt > cooldownCutoff) {
      const secondsSinceLast = (Date.now() - existing.lastGeneratedAt.getTime()) / 1000;
      const wait = Math.ceil(30 - secondsSinceLast);
      throw Object.assign(new Error(`Please wait ${wait}s before requesting another OTP.`), { status: 429 });
    }
    await prisma.oTP.update({
      where: { phone },
      data:  { otp: otpHash, expiresAt, attempts: 0, lastGeneratedAt: now },
    });
  } else {
    await prisma.oTP.create({
      data: { phone, otp: otpHash, expiresAt, attempts: 0, lastGeneratedAt: now },
    });
  }

  sendSMS(phone, otp).catch(() => {});
}

/**
 * Verify the OTP for the given phone.
 * Enforces attempt limits and expiry.
 * Returns { valid: true } or { valid: false, error: string }
 */
async function verifyOTP(phone, code) {
  const entry = await prisma.oTP.findUnique({ where: { phone } });

  if (!entry || new Date() > entry.expiresAt) {
    if (entry) await prisma.oTP.delete({ where: { phone } });
    return { valid: false, error: 'OTP expired. Please request a new one.' };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    await prisma.oTP.delete({ where: { phone } });
    return { valid: false, error: 'Too many failed attempts. Please request a new OTP.' };
  }

  const codeMatch = await bcrypt.compare(code, entry.otp);
  if (!codeMatch) {
    await prisma.oTP.update({ where: { phone }, data: { attempts: { increment: 1 } } });
    const remaining = MAX_ATTEMPTS - (entry.attempts + 1);
    return { valid: false, error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` };
  }

  await prisma.oTP.delete({ where: { phone } }); // one-time use
  return { valid: true };
}

module.exports = { generateOTP, verifyOTP };
