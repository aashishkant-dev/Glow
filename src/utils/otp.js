// src/utils/otp.js
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { sendOTPSms } = require('./smsProviders');
const { sendViaNepalOTP, verifyViaNepalOTP } = require('./smsProviders/nepalotp');

const MAX_ATTEMPTS = 5;

// NepalOTP owns both generation AND verification for +977 numbers — unlike
// Twilio (a blind SMS transport for a code WE generate), there is no local
// code to hash/compare. The OTP row's `otp` column stores their opaque
// request id instead of a bcrypt hash, tagged with this prefix so verifyOTP
// knows to delegate rather than bcrypt.compare against it.
const NEPALOTP_MARKER = 'nepalotp:';
function isNepalNumber(phone) {
  return phone.startsWith('+977');
}

function getTTLMs() {
  return (parseInt(process.env.OTP_TTL_MINUTES, 10) || 5) * 60 * 1000;
}

/**
 * Logs the OTP to console (dev always, prod only when LOG_OTP=1), then routes
 * actual delivery to the region-appropriate SMS provider (src/utils/smsProviders).
 * NEVER throws — SMS delivery is best-effort; the OTP is already saved in DB
 * and logged to console so Railway logs always have it for dev/support use.
 */
async function sendSMS(phone, otp) {
  // ⚠️ LOG_OTP=1 puts live login codes for EVERY user in Railway logs — anyone
  // with log access can take over any account. Use for launch testing only,
  // then delete the variable.
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_OTP === '1') {
    console.log(`[OTP] ${phone} → ${otp}`);
  }

  try {
    await sendOTPSms(phone, otp);
  } catch (err) {
    // Providers already catch their own errors — this is a last-resort net so a
    // provider bug never bubbles up and fails the (already-persisted) OTP request.
    console.error(`[SMS] unexpected error routing OTP for ${phone}:`, err.message);
  }
}

/**
 * Generate and store a 6-digit OTP for the given phone number.
 * Replaces any existing OTP for that phone, then sends via SMS.
 */
async function generateOTP(phone) {
  const expiresAt      = new Date(Date.now() + getTTLMs());
  const cooldownCutoff = new Date(Date.now() - 30_000);
  const now            = new Date();

  // Check for existing OTP (cooldown enforcement) — applies to both flows.
  const existing = await prisma.oTP.findUnique({ where: { phone } });
  if (existing && existing.lastGeneratedAt && existing.lastGeneratedAt > cooldownCutoff) {
    const secondsSinceLast = (Date.now() - existing.lastGeneratedAt.getTime()) / 1000;
    const wait = Math.ceil(30 - secondsSinceLast);
    throw Object.assign(new Error(`Please wait ${wait}s before requesting another OTP.`), { status: 429 });
  }

  if (isNepalNumber(phone)) {
    const requestId = await sendViaNepalOTP(phone);
    // A null requestId means NepalOTP couldn't be reached (missing API key, or
    // a network/API error). Previously we still wrote the marker row — but then
    // verifyViaNepalOTP has no key either and rejects EVERY code, so +977 login
    // was completely unusable rather than merely undelivered. Fall through to
    // the local generate/verify path instead: we own the code, so it gets
    // hashed, logged like any other number, and can actually be verified.
    if (requestId) {
      const otpValue = `${NEPALOTP_MARKER}${requestId}`;
      if (existing) {
        await prisma.oTP.update({ where: { phone }, data: { otp: otpValue, expiresAt, attempts: 0, lastGeneratedAt: now } });
      } else {
        await prisma.oTP.create({ data: { phone, otp: otpValue, expiresAt, attempts: 0, lastGeneratedAt: now } });
      }
      if (process.env.NODE_ENV !== 'production' || process.env.LOG_OTP === '1') {
        console.log(`[OTP] ${phone} → delegated to NepalOTP (request ${requestId})`);
      }
      return;
    }
    console.warn(`[OTP] ${phone} → NepalOTP unavailable, falling back to locally-generated code`);
  }

  const otp     = crypto.randomInt(100_000, 1_000_000).toString();
  const otpHash = await bcrypt.hash(otp, 10);

  if (existing) {
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

  if (entry.otp.startsWith(NEPALOTP_MARKER)) {
    const result = await verifyViaNepalOTP(phone, code);
    if (!result.valid) {
      await prisma.oTP.update({ where: { phone }, data: { attempts: { increment: 1 } } });
      return result;
    }
    await prisma.oTP.delete({ where: { phone } }); // one-time use
    return { valid: true };
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
