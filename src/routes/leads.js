// src/routes/leads.js
// Public lead capture from the landing page + admin lead list.
'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticateAdminOrUser } = require('../middleware/adminAuth');

const router = express.Router();

const VALID_SERVICES = [
  '', 'Makeup', 'Bridal Makeup', 'Party Makeup', 'Threading', 'Hair Styling',
  'Hair Coloring', 'Facial', 'Waxing', 'Nails', 'Mehendi', 'Massage', 'Other',
];

// ── POST /leads ──────────────────────────────────────────────────────────────
// Public — landing-page contact form. No auth. Stored for staff follow-up.
router.post(
  '/',
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name is required.'),
    body('phone').trim().isLength({ min: 7, max: 20 }).withMessage('A valid phone number is required.'),
    body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid email.'),
    body('message').optional().trim().isLength({ max: 2000 }),
    body('serviceType').optional().trim().isIn(VALID_SERVICES).withMessage('Invalid service type.'),
    body('source').optional().trim().isLength({ max: 50 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const { name, phone, email = '', message = '', serviceType = '', source = 'landing' } = req.body;
      const lead = await prisma.lead.create({
        data: { name, phone, email, message, serviceType, source },
        select: { id: true },
      });

      // Best-effort notify (Twilio SMS to ops if configured) — never block the response.
      try {
        const { notifyOps } = require('../utils/leadNotify');
        if (notifyOps) notifyOps({ name, phone, email, serviceType }).catch(() => {});
      } catch { /* notifier optional */ }

      res.status(201).json({ ok: true, id: lead.id, message: 'Thanks! We\'ll reach out shortly.' });
    } catch (err) {
      console.error('POST /leads error:', err);
      res.status(500).json({ error: 'Something went wrong. Please call us instead.' });
    }
  }
);

// ── GET /leads ───────────────────────────────────────────────────────────────
// Admin — list captured leads (newest first).
router.get(
  '/',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, parseInt(limit, 10) || 50);

      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          orderBy: { createdAt: 'desc' },
          skip:    (pageNum - 1) * limitNum,
          take:    limitNum,
        }),
        prisma.lead.count(),
      ]);

      res.json({ leads, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err) {
      console.error('GET /leads error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /leads/:id ───────────────────────────────────────────────────────────
// Admin — mark a lead contacted.
router.patch(
  '/:id',
  authenticateAdminOrUser,
  async (req, res) => {
    try {
      const lead = await prisma.lead.update({
        where: { id: req.params.id },
        data:  { contacted: req.body.contacted !== false },
        select: { id: true, contacted: true },
      });
      res.json(lead);
    } catch (err) {
      console.error('PATCH /leads/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
