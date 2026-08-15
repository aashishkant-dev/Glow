// src/routes/messages.js
'use strict';

const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { pushTo } = require('../utils/push');

// Resolves (customerId, providerId) for an inquiry thread between the
// current user and `otherUserId` — whichever of the two is the Provider
// takes the providerId slot, regardless of who initiated. A message with no
// booking is only ever between exactly one customer and one provider, so
// this pair is the thread's real identity (see the Message.bookingId
// comment in schema.prisma for why it's not its own model).
async function resolveInquiryPair(me, otherUserId) {
  const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true, role: true, name: true } });
  if (!other) return null;
  if (me.role === 'Provider' && other.role === 'CUSTOMER') return { customerId: other.id, providerId: me.id, other };
  if (me.role === 'CUSTOMER' && other.role === 'Provider') return { customerId: me.id, providerId: other.id, other };
  return null; // only customer<->provider inquiries make sense
}

// GET /messages/inquiries — my inquiry threads (latest message each),
// newest first. Must come before /:bookingId below — Express matches route
// patterns in declaration order and /:bookingId would otherwise swallow the
// literal "inquiries" segment.
router.get('/inquiries', authenticate, async (req, res) => {
  try {
    const isProvider = req.user.role === 'Provider';
    const mine = await prisma.message.findMany({
      where: isProvider ? { providerId: req.user.id } : { customerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 300, // enough recent activity to reconstruct threads without scanning the whole table
    });
    const byOther = new Map();
    for (const m of mine) {
      const otherId = isProvider ? m.customerId : m.providerId;
      if (!otherId || byOther.has(otherId)) continue; // first hit per id is the newest (already sorted desc)
      byOther.set(otherId, m);
    }
    const otherIds = [...byOther.keys()];
    const others = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true, photoUrl: true } });
    const otherById = new Map(others.map(u => [u.id, u]));
    const threads = otherIds.map(id => ({
      otherUserId: id,
      otherName: otherById.get(id)?.name ?? 'Someone',
      otherPhotoUrl: otherById.get(id)?.photoUrl || null,
      lastMessage: byOther.get(id).text,
      lastMessageAt: byOther.get(id).createdAt,
      unread: byOther.get(id).senderId !== req.user.id && !byOther.get(id).read,
    }));
    res.json({ threads });
  } catch (err) {
    console.error('GET /messages/inquiries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /messages/inquiry — send a pre-booking message. Body: { otherUserId, text }
router.post('/inquiry', authenticate, async (req, res) => {
  try {
    const { otherUserId, text } = req.body;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!otherUserId || !trimmed) return res.status(400).json({ error: 'otherUserId and text are required' });
    if (trimmed.length > 1000) return res.status(400).json({ error: 'Message is too long' });

    const pair = await resolveInquiryPair(req.user, otherUserId);
    if (!pair) return res.status(400).json({ error: 'That recipient is not available for messages.' });

    const msg = await prisma.message.create({
      data: {
        customerId: pair.customerId,
        providerId: pair.providerId,
        senderId:   req.user.id,
        senderName: req.user.name,
        senderRole: req.user.role,
        text:       trimmed,
      },
    });

    if (pair.other.id !== req.user.id) {
      const recipient = await prisma.user.findUnique({ where: { id: pair.other.id }, select: { expoPushToken: true } });
      if (recipient?.expoPushToken) {
        pushTo(
          recipient.expoPushToken,
          `💬 ${req.user.name}`,
          trimmed.slice(0, 100),
          { type: 'inquiry', otherUserId: req.user.id },
          'chat',
        ).catch(() => {});
      }
    }

    res.status(201).json({ message: { ...msg, _id: msg.id } });
  } catch (err) {
    console.error('POST /messages/inquiry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /messages/inquiry/:otherUserId — thread history + mark read
router.get('/inquiry/:otherUserId', authenticate, async (req, res) => {
  try {
    const pair = await resolveInquiryPair(req.user, req.params.otherUserId);
    if (!pair) return res.status(400).json({ error: 'That recipient is not available for messages.' });

    const messages = await prisma.message.findMany({
      where:   { customerId: pair.customerId, providerId: pair.providerId },
      orderBy: { createdAt: 'asc' },
      take:    50,
    });
    await prisma.message.updateMany({
      where: { customerId: pair.customerId, providerId: pair.providerId, senderId: { not: req.user.id }, read: false },
      data:  { read: true },
    });
    res.json({ messages: messages.map(m => ({ ...m, _id: m.id })) });
  } catch (err) {
    console.error('GET /messages/inquiry/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
