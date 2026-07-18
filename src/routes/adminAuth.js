// src/routes/adminAuth.js
'use strict';

const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const prisma   = require('../lib/prisma');
const { authenticateAdmin, logAudit } = require('../middleware/adminAuth');
const { JWT_SECRET } = require('../lib/jwt');

const router = express.Router();

// ── POST /admin/bootstrap ──────────────────────────────────────────────────────
router.post(
  '/bootstrap',
  async (req, res) => {
    // Only callable if ADMIN_BOOTSTRAP_PASSWORD env var is set
    if (!process.env.ADMIN_BOOTSTRAP_PASSWORD) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.body.password !== process.env.ADMIN_BOOTSTRAP_PASSWORD) {
      return res.status(401).json({ error: 'Invalid bootstrap password' });
    }
    try {
      const adminCount = await prisma.admin.count();
      if (adminCount > 0) {
        return res.status(400).json({ error: 'Admin already exists' });
      }

      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const admin = await prisma.admin.create({
        data: {
          username: username.toLowerCase(),
          passwordHash,
          email:    'support@glow.app',
          role:     'SUPER_ADMIN',
          isActive: true,
          canApproveProvider:      true,
          canVerifyDocuments: true,
          canManageBookings:  true,
          canViewAnalytics:   true,
        },
      });

      res.json({ message: 'Admin created', username: admin.username });
    } catch (err) {
      console.error('Bootstrap error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/login ──────────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { username, password } = req.body;

      // Try Admin model first
      const admin = await prisma.admin.findUnique({ where: { username: username.toLowerCase() } });
      if (admin) {
        if (!admin.isActive) return res.status(401).json({ error: 'Account is disabled' });
        const isMatch = await bcrypt.compare(password, admin.passwordHash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        await prisma.admin.update({ where: { id: admin.id }, data: { lastLogin: new Date() } });
        const token = jwt.sign({ adminId: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
        await logAudit(admin.id, 'ADMIN_LOGIN', null, null, { username: admin.username }, req);

        // Strip passwordHash from response
        const { passwordHash: _ph, ...adminOut } = admin;
        return res.json({ token, admin: adminOut, expiresIn: 2592000 });
      }

      // Auto-bootstrap: only runs when NO admin accounts exist yet (one-time setup).
      // Once any admin row exists, this path is permanently disabled — use the admin
      // UI to create additional admins. This prevents the bootstrap password from
      // acting as a permanent backdoor credential.
      const bootstrapUser = process.env.ADMIN_USERNAME || 'admin';
      const bootstrapPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
      if (bootstrapPass && username.toLowerCase() === bootstrapUser && password === bootstrapPass) {
        const existingCount = await prisma.admin.count();
        if (existingCount > 0) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const newAdmin = await prisma.admin.create({
          data: {
            username:           bootstrapUser,
            passwordHash,
            email:              'support@glow.app',
            role:               'SUPER_ADMIN',
            isActive:           true,
            canApproveProvider:      true,
            canVerifyDocuments: true,
            canManageBookings:  true,
            canViewAnalytics:   true,
          },
        });
        const token = jwt.sign({ adminId: newAdmin.id, role: newAdmin.role }, JWT_SECRET, { expiresIn: '30d' });
        const { passwordHash: _ph2, ...newAdminOut } = newAdmin;
        return res.json({ token, admin: newAdminOut, expiresIn: 2592000 });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
      console.error('Admin login error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /admin/logout ─────────────────────────────────────────────────────────
router.post(
  '/logout',
  authenticateAdmin,
  async (req, res) => {
    await logAudit(req.adminId, 'ADMIN_LOGOUT', null, null, {}, req);
    res.json({ message: 'Logged out successfully' });
  }
);

// ── GET /admin/me ──────────────────────────────────────────────────────────────
router.get(
  '/me',
  authenticateAdmin,
  async (req, res) => {
    const { passwordHash: _ph, ...adminOut } = req.admin;
    res.json({ admin: adminOut });
  }
);

// ── POST /admin/change-password ────────────────────────────────────────────────
router.post(
  '/change-password',
  authenticateAdmin,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { currentPassword, newPassword } = req.body;
      const admin = await prisma.admin.findUnique({ where: { id: req.adminId } });
      const isMatch = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await prisma.admin.update({ where: { id: req.adminId }, data: { passwordHash: newHash } });

      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
