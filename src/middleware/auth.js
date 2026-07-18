// src/middleware/auth.js
'use strict';

const jwt    = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET, JWT_ALGORITHMS } = require('../lib/jwt');

/**
 * Verifies the Bearer JWT from the Authorization header.
 * Attaches the full User record to req.user.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
    const user    = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.deletedAt) return res.status(403).json({ error: 'This account has been deleted.' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Factory: returns middleware that restricts access to users with one of the given roles.
 * Must be used after `authenticate`.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
