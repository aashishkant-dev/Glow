// src/routes/providerApplicants.js
// Public Provider recruitment funnel from the landing page "Apply as a Provider" form,
// plus admin list/update. Separate from leads.js (customer care requests) —
// applicants answer structured screening questions so admin can triage who's
// ready to fast-track vs who needs a closer look, without reading free text.
'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticateAdminOrUser } = require('../middleware/adminAuth');

const router = express.Router();

const VALID_QUALIFICATIONS = [
  '', 'Makeup Artist', 'Hair Stylist', 'Esthetician', 'Nail Technician', 'Mehendi Artist', 'Cosmetology Student', 'Other', 'None yet',
];
const VALID_AVAILABILITY = [
  '', 'Weekdays', 'Evenings & weekends', 'Overnights', 'Flexible / Anytime',
];

// Normalize free-text phone ("(705) 555-0000", "705 555 0000") to E.164 so
// applicant records match the app's User.phone (+1705...) when the Provider later
// registers — without this the admin can't correlate the two. Falls back to
// the raw string when it isn't a recognizable NA number.
function normalizePhone(raw) {
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return String(raw).trim();
}

// Computes a coarse auto-screen bucket from self-reported screening answers.
// This is a triage aid, NOT an approval — every applicant still goes through
// the real admin-approval + document-verification flow (ProviderProfile.approvedByAdmin)
// before they can appear as bookable in the app.
function autoScreen({ qualificationType, hasPoliceCheck, hasFirstAid, experienceYears }) {
  const hasCredential = !!qualificationType && qualificationType !== 'None yet';
  if (hasCredential && hasPoliceCheck && hasFirstAid) return 'qualified';
  if (!hasCredential && !hasPoliceCheck) return 'unqualified';
  return 'review';
}

// ── POST /provider-applicants ───────────────────────────────────────────────────────
// Public — landing-page "Apply as a Provider" form. No auth.
router.post(
  '/',
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name is required.'),
    body('phone').trim().isLength({ min: 7, max: 20 }).withMessage('A valid phone number is required.'),
    body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid email.'),
    body('city').optional().trim().isLength({ max: 100 }),
    body('qualificationType').optional().trim().isIn(VALID_QUALIFICATIONS).withMessage('Invalid qualification.'),
    body('experienceYears').optional().isInt({ min: 0, max: 60 }).withMessage('Experience years must be a whole number.'),
    body('hasPoliceCheck').optional().isBoolean().withMessage('hasPoliceCheck must be true/false.'),
    body('hasFirstAid').optional().isBoolean().withMessage('hasFirstAid must be true/false.'),
    body('hasReliableTransport').optional().isBoolean().withMessage('hasReliableTransport must be true/false.'),
    body('availability').optional().trim().isIn(VALID_AVAILABILITY).withMessage('Invalid availability.'),
    body('message').optional().trim().isLength({ max: 2000 }),
    body('source').optional().trim().isLength({ max: 50 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const {
        name, phone, email = '', city = '',
        qualificationType = '', experienceYears = 0,
        hasPoliceCheck = false, hasFirstAid = false, hasReliableTransport = false,
        availability = '', message = '', source = 'landing-provider-apply',
      } = req.body;

      const screenResult = autoScreen({ qualificationType, hasPoliceCheck, hasFirstAid, experienceYears });

      const applicant = await prisma.providerApplicant.create({
        data: {
          name, phone: normalizePhone(phone), email, city,
          qualificationType, experienceYears: Number(experienceYears) || 0,
          hasPoliceCheck: !!hasPoliceCheck, hasFirstAid: !!hasFirstAid,
          hasReliableTransport: !!hasReliableTransport,
          availability, message, source, screenResult,
        },
        select: { id: true },
      });

      // Best-effort notify ops — never block the response.
      try {
        const { notifyOps } = require('../utils/leadNotify');
        if (notifyOps) notifyOps({ name, phone, email, serviceType: `Provider applicant (${screenResult})` }).catch(() => {});
      } catch { /* notifier optional */ }

      res.status(201).json({
        ok: true,
        id: applicant.id,
        message: "Thanks for applying! We'll review your application and reach out about next steps.",
      });
    } catch (err) {
      console.error('POST /provider-applicants error:', err);
      res.status(500).json({ error: 'Something went wrong. Please call us instead.' });
    }
  }
);

// ── GET /provider-applicants ────────────────────────────────────────────────────────
// Admin — list applicants (newest first), optional status/screenResult filter.
router.get(
  '/',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status, screenResult } = req.query;
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 50);

      const where = {
        ...(status ? { status } : {}),
        ...(screenResult ? { screenResult } : {}),
      };

      const [applicants, total] = await Promise.all([
        prisma.providerApplicant.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
        }),
        prisma.providerApplicant.count({ where }),
      ]);

      res.json({ applicants, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err) {
      console.error('GET /provider-applicants error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /provider-applicants/:id ──────────────────────────────────────────────────
// Admin — update status (new / contacted / interview_scheduled / approved / rejected).
const VALID_STATUSES = ['new', 'contacted', 'interview_scheduled', 'approved', 'rejected'];
router.patch(
  '/:id',
  authenticateAdminOrUser,
  [body('status').optional().isIn(VALID_STATUSES).withMessage('Invalid status.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const data = {};
      if (req.body.status) {
        data.status = req.body.status;
        data.contacted = req.body.status !== 'new';
      } else if (req.body.contacted !== undefined) {
        data.contacted = req.body.contacted !== false;
      }
      const applicant = await prisma.providerApplicant.update({
        where: { id: req.params.id },
        data,
        select: { id: true, status: true, contacted: true },
      });
      res.json(applicant);
    } catch (err) {
      console.error('PATCH /provider-applicants/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
