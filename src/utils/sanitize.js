'use strict';

function sanitizeName(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+(And|&)\s*$/i, '')
    .replace(/^\s*(And|&)\s+/i, '')
    .trim();
}

module.exports = { sanitizeName };
