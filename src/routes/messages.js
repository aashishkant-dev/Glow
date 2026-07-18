// src/routes/messages.js
'use strict';

const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

// GET /messages/:bookingId/unread — unread count for this user
// IMPORTANT: defined BEFORE /:bookingId so Express matches the literal segment first
router.get('/:bookingId/unread', authenticate, async (req, res) => {
  try {
    const count = await prisma.message.count({
      where: { bookingId: req.params.bookingId, senderId: { not: req.user.id }, read: false },
    });
    res.json({ count });
  } catch (err) {
    console.error('GET /messages/:id/unread error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /messages/:bookingId — fetch last 50 messages
router.get('/:bookingId', authenticate, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.bookingId } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const isParty =
      booking.customerId === req.user.id ||
      booking.providerId      === req.user.id;
    if (!isParty) return res.status(403).json({ error: 'Not authorized' });

    const messages = await prisma.message.findMany({
      where:   { bookingId: req.params.bookingId },
      orderBy: { createdAt: 'asc' },
      take:    50,
    });

    // Mark all as read for this user
    await prisma.message.updateMany({
      where: { bookingId: req.params.bookingId, senderId: { not: req.user.id }, read: false },
      data:  { read: true },
    });

    res.json({ messages: messages.map(m => ({ ...m, _id: m.id })) });
  } catch (err) {
    console.error('GET /messages/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
