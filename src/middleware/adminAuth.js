// src/middleware/adminAuth.js
'use strict';

const jwt    = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET, JWT_ALGORITHMS } = require('../lib/jwt');

// Accepts both Admin-model tokens (web panel) and User-model tokens with role=ADMIN (mobile app)
async function authenticateAdminOrUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
    if (payload.adminId && typeof payload.adminId === 'string') {
      const admin = await prisma.admin.findUnique({ where: { id: payload.adminId } });
      if (!admin)          return res.status(401).json({ error: 'Admin not found' });
      if (!admin.isActive) return res.status(401).json({ error: 'Admin account is disabled' });
      req.admin   = admin;
      req.adminId = admin.id;
      req.user    = { id: admin.id, _id: admin.id, role: 'ADMIN', name: admin.username };
      return next();
    } else if (payload.userId) {
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user)                  return res.status(401).json({ error: 'User not found' });
      if (user.role !== 'ADMIN')  return res.status(403).json({ error: 'Forbidden' });
      req.user = user;
      return next();
    }
    return res.status(401).json({ error: 'Invalid token payload' });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function authenticateAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
    const admin   = await prisma.admin.findUnique({ where: { id: payload.adminId } });

    if (!admin)          return res.status(401).json({ error: 'Admin not found' });
    if (!admin.isActive) return res.status(401).json({ error: 'Admin account is disabled' });

    req.admin   = admin;
    req.adminId = admin.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdminRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

async function logAudit(adminId, action, entityType, entityId, details = {}, req) {
  try {
    await prisma.auditLog.create({
      data: {
        adminId,
        action,
        entityType: entityType || null,
        entityId:   entityId   ? String(entityId) : null,
        details,
        ipAddress:  req?.ip || req?.connection?.remoteAddress || null,
        userAgent:  req?.get('User-Agent') || null,
      },
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = { authenticateAdmin, authenticateAdminOrUser, requireAdminRole, logAudit };
