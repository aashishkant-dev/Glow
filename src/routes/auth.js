// src/routes/auth.js
'use strict';

const express = require('express');
const { body } = require('express-validator');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');
const { generateOTP, verifyOTP } = require('../utils/otp');
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
router.post(
  '/login',
  [
    body('phone').trim().notEmpty().withMessage('phone is required'),
    body('name').optional().trim().notEmpty().withMessage('name must not be blank if provided'),
    body('role').optional().isIn(['CUSTOMER', 'Provider', 'SALON']).withMessage('role must be CUSTOMER, Provider, or SALON'),
  ],
  validate,
  async (req, res) => {
    try {
      const { phone: rawPhone, name: rawName, role } = req.body;
      const phone = normalizePhone(rawPhone);
      const name  = rawName ? sanitizeName(rawName) : undefined;

      let user = await prisma.user.findUnique({ where: { phone } });

      if (user && user.deletedAt) {
        return res.status(403).json({ error: 'This account has been deleted.' });
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
            data: { phone, name, role },
          });
        }

        if (role === 'Provider' && !isDemoPhone(phone)) {
          await prisma.providerProfile.create({ data: { userId: user.id } });
        }
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

// ── POST /auth/verify ──────────────────────────────────────────────────────────
router.post(
  '/verify',
  [
    body('phone').trim().notEmpty().withMessage('phone is required'),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('otp must be exactly 6 digits').isNumeric().withMessage('otp must be numeric'),
  ],
  validate,
  async (req, res) => {
    try {
      const { otp } = req.body;
      const phone   = normalizePhone(req.body.phone);

      const user = await prisma.user.findUnique({ where: { phone } });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.deletedAt) return res.status(403).json({ error: 'This account has been deleted.' });

      // Demo reviewer number accepts the fixed code without hitting the OTP store.
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

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d', algorithm: 'HS256' }
      );

      // Onboarding status: trust ONLY the stored flag (set by POST /auth/provider-profile
      // when the Provider finishes the 4-step flow). Do NOT infer from profile fields —
      // a fresh Provider profile is created at registration with qualificationType
      // defaulting to Provider, so inferring from it skipped onboarding for everyone.
      // Legacy fallback: only treat a Provider as onboarded if they actually submitted
      // documents (real proof of completion), for accounts predating the flag.
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
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

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
