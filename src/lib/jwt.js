'use strict';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required and must be set');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHMS = ['HS256'];

module.exports = { JWT_SECRET, JWT_ALGORITHMS };
