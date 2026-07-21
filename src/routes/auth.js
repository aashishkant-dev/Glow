// src/routes/auth.js
'use strict';

const express = require('express');
const { body } = require('express-validator');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');
const { generateOTP, verifyOTP } = require('../utils/otp');
const { verifyGoogleIdToken } = require('../utils/googleAuth');
const validate         = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { cacheDel } = require('../utils/cache');
const { JWT_SECRET } = require('../lib/jwt');

const router = express.Router();

// ── Name sanitizer ─────────────────────────────────────────────────────────────
const { sanitizeName } = require('../utils/sanitize');

// ── Phone normalizer ───────────────────────────────────────────────────────────
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return phone;
}

// ── App Store reviewer demo account ──────────────────────────────────────────
// Login is phone + Twilio OTP, which a reviewer can't reliably receive. This one
// reserved number bypasses Twilio and accepts a fixed code so Apple/Google review
// can always sign in. Override via env for safety. Document the number + code in
// the App Review notes.
const DEMO_PHONE = process.env.DEMO_REVIEW_PHONE ? normalizePhone(process.env.DEMO_REVIEW_PHONE) : null;
const DEMO_OTP   = process.env.DEMO_REVIEW_OTP   || null;
const isDemoPhone = (phone) => !!(DEMO_PHONE && DEMO_OTP && phone === DEMO_PHONE);

// Strict per-IP rate limit for demo verify: 3 attempts per 15 min.
// Prevents brute-forcing the static DEMO_OTP even if someone discovers the demo number.
const _demoAttempts = new Map(); // ip -> { count, resetAt }
function checkDemoRateLimit(ip) {
  const now = Date.now();
  const entry = _demoAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    _demoAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

// ── POST /auth/login ───────────────────────────────────────────────────────────
// ── POST /auth/send-login-otp ────────────────────────────────────────────────
// Step 1 of phone login: send an OTP to the given number. No account is
// created and no token is issued here — that only happens once the code is
// verified in /auth/login below. Demo phone skips real delivery (fixed code).
router.post(
  '/send-login-otp',
  [body('phone').trim().notEmpty().withMessage('phone is required')],
  validate,
  async (req, res) => {
    try {
      const phone = normalizePhone(req.body.phone);

      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing && existing.deletedAt) {
        return res.status(403).json({ error: 'This account has been deleted.' });
      }

      if (isDemoPhone(phone)) {
        return res.json({ message: 'OTP sent' }); // fixed DEMO_OTP, no real send
      }

      try {
        await generateOTP(phone);
      } catch (err) {
        if (err.status === 429) return res.status(429).json({ error: err.message });
        throw err;
      }
      res.json({ message: 'OTP sent' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post(
  '/login',
  [
    body('phone').trim().notEmpty().withMessage('phone is required'),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('otp must be exactly 6 digits').isNumeric().withMessage('otp must be numeric'),
    body('name').optional().trim().notEmpty().withMessage('name must not be blank if provided'),
    body('role').optional().isIn(['CUSTOMER', 'Provider', 'SALON']).withMessage('role must be CUSTOMER, Provider, or SALON'),
  ],
  validate,
  async (req, res) => {
    try {
      const { phone: rawPhone, otp, name: rawName, role } = req.body;
      const phone = normalizePhone(rawPhone);
      const name  = rawName ? sanitizeName(rawName) : undefined;

      let user = await prisma.user.findUnique({ where: { phone } });

      if (user && user.deletedAt) {
        return res.status(403).json({ error: 'This account has been deleted.' });
      }

      // Verify the OTP before touching the account — a wrong/missing code must
      // never create a user or issue a token. Demo phone uses its fixed code
      // (same bypass /auth/verify-phone already relies on) since Twilio can't
      // reliably reach App Store/Play reviewers.
      if (isDemoPhone(phone)) {
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        if (!checkDemoRateLimit(String(ip).split(',')[0].trim())) {
          return res.status(429).json({ error: 'Too many attempts. Try again later.' });
        }
        if (otp !== DEMO_OTP) return res.status(400).json({ error: 'Invalid code' });
      } else {
        const result = await verifyOTP(phone, otp);
        if (!result.valid) {
          return res.status(400).json({ error: result.error });
        }
      }

      // Demo phone can switch roles between logins — the single reviewer number
      // must be able to test both the client and Provider sides of the app.
      if (user && isDemoPhone(phone) && (role === 'Provider' || role === 'CUSTOMER') && user.role !== role) {
        user = await prisma.user.update({
          where: { id: user.id },
          data:  { role, onboardingComplete: role === 'Provider' ? true : user.onboardingComplete },
        });
        if (role === 'Provider') {
          await prisma.providerProfile.upsert({
            where:  { userId: user.id },
            update: { approvedByAdmin: true },
            create: { userId: user.id, approvedByAdmin: true, bio: 'App Store review demo account' },
          });
        }
      }

      if (!user) {
        if (isDemoPhone(phone)) {
          const demoRole = role === 'Provider' ? 'Provider' : 'CUSTOMER';
          user = await prisma.user.create({
            data: { phone, name: 'App Reviewer', role: demoRole, onboardingComplete: demoRole === 'Provider', phoneVerified: true },
          });
          if (demoRole === 'Provider') {
            await prisma.providerProfile.create({
              data: { userId: user.id, approvedByAdmin: true, bio: 'App Store review demo account' },
            });
          }
        } else {
          if (!name || !role) {
            return res.status(400).json({
              error: 'First-time users must provide name and role (CUSTOMER, Provider, or SALON)',
            });
          }
          user = await prisma.user.create({
            data: { phone, name, role, phoneVerified: true },
          });
        }

        if (role === 'Provider' && !isDemoPhone(phone)) {
          await prisma.providerProfile.create({ data: { userId: user.id } });
        }
      } else if (!user.phoneVerified) {
        // Returning user whose number was never verified (pre-OTP-era accounts) —
        // a successful OTP check here proves ownership, so mark it now.
        user = await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d', algorithm: 'HS256' }
      );

      let onboardingComplete = user.onboardingComplete;
      if (user.role === 'Provider' && !onboardingComplete) {
        const profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
        onboardingComplete = !!(profile && (
          profile.licenseNumber ||
          (Array.isArray(profile.submittedDocuments) && profile.submittedDocuments.length > 0)
        ));
      }

      res.json({
        token,
        user: {
          id:                 user.id,
          name:               user.name,
          role:               user.role,
          phone:              user.phone,
          photoUrl:           user.photoUrl || null,
          onboardingComplete,
          phoneVerified:      user.phoneVerified,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /auth/send-verify-otp ───────────────────────────────────────────────
// Sends an OTP to the authenticated user's own phone, for the verify-at-booking
// flow (Part 1 of the 2026-07-20 auth redesign). Requires the account to already
// have a phone on file — accounts without one (Google/email signups) collect a
// phone via /auth/verify-phone's optional `phone` field instead, and this route
// isn't called for them until after that phone is set.
router.post('/send-verify-otp', authenticate, async (req, res) => {
  try {
    if (!req.user.phone) {
      return res.status(400).json({ error: 'No phone on file. Provide one via /auth/verify-phone.' });
    }
    if (isDemoPhone(req.user.phone)) {
      return res.json({ message: 'OTP sent' }); // demo account skips real Twilio, same as login used to
    }
    try {
      await generateOTP(req.user.phone);
    } catch (err) {
      if (err.status === 429) return res.status(429).json({ error: err.message });
      console.error('[OTP] send-verify-otp failed:', err);
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
    res.json({ message: 'OTP sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /auth/verify-phone ──────────────────────────────────────────────────
// Marks the authenticated user's phone verified. If they had no phone yet
// (Google/email signup), `phone` must be supplied and gets set + normalized here.
router.post(
  '/verify-phone',
  authenticate,
  [
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('otp must be exactly 6 digits').isNumeric().withMessage('otp must be numeric'),
    body('phone').optional().trim().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      const { otp } = req.body;
      let phone = req.user.phone;

      if (!phone) {
        if (!req.body.phone) {
          return res.status(400).json({ error: 'phone is required — this account has none on file yet.' });
        }
        phone = normalizePhone(req.body.phone);
        const existing = await prisma.user.findUnique({ where: { phone } });
        if (existing && existing.id !== req.user.id) {
          return res.status(409).json({ error: 'That phone number is already registered to another account.' });
        }
      }

      if (isDemoPhone(phone)) {
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        if (!checkDemoRateLimit(String(ip).split(',')[0].trim())) {
          return res.status(429).json({ error: 'Too many attempts. Try again later.' });
        }
        if (otp !== DEMO_OTP) return res.status(400).json({ error: 'Invalid code' });
      } else {
        const result = await verifyOTP(phone, otp);
        if (!result.valid) {
          return res.status(400).json({ error: result.error });
        }
      }

      const updated = await prisma.user.update({
        where: { id: req.user.id },
        data:  { phone, phoneVerified: true },
      });

      res.json({
        user: {
          id:                 updated.id,
          name:               updated.name,
          role:               updated.role,
          phone:              updated.phone,
          photoUrl:           updated.photoUrl || null,
          onboardingComplete: updated.onboardingComplete,
          phoneVerified:      updated.phoneVerified,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /auth/google ────────────────────────────────────────────────────────
// Google Sign-In for customers only — Providers still onboard via phone since
// they need document verification regardless of how they authenticate.
router.post(
  '/google',
  [body('idToken').trim().notEmpty().withMessage('idToken is required')],
  validate,
  async (req, res) => {
    try {
      let payload;
      try {
        payload = await verifyGoogleIdToken(req.body.idToken);
      } catch (err) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }

      let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });

      if (!user && payload.email) {
        // Link to an existing phone/email account with the same email rather
        // than creating a duplicate. Never link to a soft-deleted account —
        // that would stamp this Google identity onto a dead row, and every
        // future sign-in with it would then find the dead row via googleId
        // and 403 forever with no way to create a fresh account. Treat a
        // deleted match as "no matching account" and fall through to create.
        const existingByEmail = await prisma.user.findUnique({ where: { email: payload.email } });
        if (existingByEmail && !existingByEmail.deletedAt) {
          user = await prisma.user.update({
            where: { id: existingByEmail.id },
            data:  { googleId: payload.sub },
          });
        }
      }

      if (!user) {
        user = await prisma.user.create({
          data: {
            googleId: payload.sub,
            email:    payload.email,
            name:     payload.name || 'Glow User',
            role:     'CUSTOMER',
            photoUrl: payload.picture || '',
          },
        });
      }

      if (user.deletedAt) {
        return res.status(403).json({ error: 'This account has been deleted.' });
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d', algorithm: 'HS256' }
      );

      res.json({
        token,
        user: {
          id:                 user.id,
          name:               user.name,
          role:               user.role,
          phone:              user.phone,
          photoUrl:           user.photoUrl || null,
          onboardingComplete: user.onboardingComplete,
          phoneVerified:      user.phoneVerified,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Email+password login (register-email/login-email/forgot-password/reset-password)
// was removed — Google and phone+OTP are the only login methods. See
// docs/superpowers/plans (2026-07-20 auth-overhaul) for the original build; this
// keeps User.passwordHash/email nullable/unique in the schema for any legacy rows,
// but no route reads or writes them anymore.

// ── POST /auth/provider-profile ─────────────────────────────────────────────────────
router.post(
  '/provider-profile',
  authenticate,
  [
    body('qualificationType')
      .optional()
      .isIn(['MAKEUP_ARTIST', 'HAIR_STYLIST', 'ESTHETICIAN', 'NAIL_TECH', 'MEHENDI_ARTIST', 'MASSAGE_THERAPIST', 'COSMETOLOGIST', 'Other'])
      .withMessage('Invalid qualification type'),
    body('experienceYears')
      .optional()
      .isInt({ min: 0, max: 50 }).withMessage('experienceYears must be 0–50'),
  ],
  validate,
  async (req, res) => {
    try {
      if (req.user.role !== 'Provider') {
        return res.status(403).json({ error: 'Only Provider accounts can submit credentials' });
      }

      const {
        qualificationType,
        licenseNumber,
        collegeName,
        experienceYears,
        specialties,
        certifications,
        firstAidCertified,
        driversLicense,
        ownTransportation,
        bio,
        languages,
        photos,
        pricingModel,
        hourlyRate,
        priceNegotiable,
      } = req.body;

      const data = {};
      if (qualificationType  !== undefined) data.qualificationType  = qualificationType;
      if (licenseNumber      !== undefined) data.licenseNumber      = licenseNumber.trim();
      if (collegeName        !== undefined) data.collegeName        = collegeName.trim();
      if (experienceYears    !== undefined) data.experienceYears    = Number(experienceYears);
      if (Array.isArray(specialties))       data.specialties        = specialties;
      if (Array.isArray(certifications))    data.certifications     = certifications;
      if (firstAidCertified  !== undefined) data.firstAidCertified  = Boolean(firstAidCertified);
      if (driversLicense     !== undefined) data.driversLicense     = Boolean(driversLicense);
      if (ownTransportation  !== undefined) data.ownTransportation  = Boolean(ownTransportation);
      if (bio                !== undefined) data.bio                = bio.trim();
      if (Array.isArray(languages))         data.languages          = languages;
      if (Array.isArray(photos))            data.photos             = photos.filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, 10);
      if (pricingModel       !== undefined) data.pricingModel       = pricingModel === 'PER_SERVICE' ? 'PER_SERVICE' : 'HOURLY';
      if (hourlyRate         !== undefined && pricingModel !== 'PER_SERVICE') data.hourlyRate = Number(hourlyRate) || 25;
      if (priceNegotiable    !== undefined) data.priceNegotiable    = Boolean(priceNegotiable);

      const profile = await prisma.providerProfile.upsert({
        where:  { userId: req.user.id },
        update: data,
        create: { userId: req.user.id, ...data },
      });

      // Mark onboarding as complete on the User record
      await prisma.user.update({
        where: { id: req.user.id },
        data:  { onboardingComplete: true },
      });

      // Bust admin Provider list cache so new profile appears immediately
      await Promise.all([
        cacheDel('admin:providers:all:p1:l50'),
        cacheDel('admin:providers:false:p1:l50'),
      ]).catch(() => {});

      res.json({ message: 'Provider profile updated', profile });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
