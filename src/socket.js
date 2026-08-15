// src/socket.js
'use strict';

const { Server } = require('socket.io');
const jwt    = require('jsonwebtoken');
const prisma = require('./lib/prisma');
const { pushTo } = require('./utils/push');
const { JWT_SECRET, JWT_ALGORITHMS } = require('./lib/jwt');

const SOCKET_ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

function isSocketOriginAllowed(origin) {
  if (!origin) return true;
  if (SOCKET_ALLOWED_ORIGINS.includes('*')) return true;
  if (SOCKET_ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    // Same whitelist as HTTP CORS in app.js: localhost + *.glow.app +
    // the exact two Vercel project slugs (glow + glow-landing).
    // Wildcard *.vercel.app is intentionally excluded here.
    return hostname === 'localhost' ||
      hostname.endsWith('.glow.app') ||
      /^glow(-landing)?(-[a-z0-9]+)?\.vercel\.app$/.test(hostname);
  } catch { return false; }
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    // cors `origin` as a function MUST use the (origin, callback) signature —
    // passing a boolean-returning function directly makes the cors middleware
    // wait forever for the callback and every handshake hangs (prod outage 7/1–7/8).
    cors: { origin: (origin, cb) => cb(null, isSocketOriginAllowed(origin)), methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  // Auth middleware — verify JWT on handshake.
  // Accepts both User tokens ({ userId }) and Admin tokens ({ adminId }).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
      if (payload.userId)  socket.userId  = payload.userId;
      if (payload.adminId) { socket.adminId = payload.adminId; socket.isAdmin = true; }
      if (!socket.userId && !socket.adminId) return next(new Error('Invalid token payload'));
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // Auto-join personal room from the JWT identity — don't rely on the client
    // remembering to emit join-user, or message-notifications/job events miss the
    // recipient (they appeared "not received").
    if (socket.userId) socket.join(`user-${socket.userId}`);

    // Admin dashboard joins a shared room to receive platform-wide events
    socket.on('join-admin', () => {
      if (socket.isAdmin || socket.adminId) {
        socket.join('admin-room');
      }
    });

    // Join user-specific room — only allowed to join own room
    socket.on('join-user', ({ userId }) => {
      if (userId && userId === socket.userId) socket.join(`user-${userId}`);
    });

    // Join a booking room
    socket.on('join-booking', async ({ bookingId }) => {
      if (!bookingId) return;
      try {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) return;
        const isParty =
          booking.customerId === socket.userId ||
          booking.providerId      === socket.userId;
        if (!isParty) return;
        socket.join(`booking:${bookingId}`);
        socket.currentBookingId = bookingId;
      } catch {}
    });

    // Send a message
    socket.on('send-message', async ({ bookingId, text }) => {
      if (!bookingId || !text?.trim()) return;
      if (text.trim().length > 1000) return;
      try {
        const [booking, sender] = await Promise.all([
          prisma.booking.findUnique({ where: { id: bookingId } }),
          prisma.user.findUnique({ where: { id: socket.userId }, select: { name: true, role: true } }),
        ]);
        if (!booking || !sender) return;
        const isParty =
          booking.customerId === socket.userId ||
          booking.providerId      === socket.userId;
        if (!isParty) return;

        const msg = await prisma.message.create({
          data: {
            bookingId,
            senderId:   socket.userId,
            senderName: sender.name,
            senderRole: sender.role,
            text:       text.trim(),
          },
        });

        const payload = {
          _id:        msg.id,
          bookingId,
          senderId:   socket.userId,
          senderName: msg.senderName,
          senderRole: msg.senderRole,
          text:       msg.text,
          createdAt:  msg.createdAt,
          read:       false,
        };
        // To the open chat (both parties in the booking room).
        io.to(`booking:${bookingId}`).emit('new-message', payload);

        // Separate notification event to the recipient's personal room, so they
        // get a banner/bell even when NOT on the chat screen (they only join the
        // booking room while viewing the chat). A distinct event avoids a double
        // when they ARE in the chat (ChatScreen listens to 'new-message' only).
        const recipientId = socket.userId === booking.customerId ? booking.providerId : booking.customerId;
        if (recipientId) io.to(`user-${recipientId}`).emit('message-notification', payload);
        if (recipientId) {
          const recipient = await prisma.user.findUnique({
            where:  { id: recipientId },
            select: { expoPushToken: true },
          });
          if (recipient?.expoPushToken) {
            pushTo(
              recipient.expoPushToken,
              `💬 ${msg.senderName}`,
              msg.text.slice(0, 100),
              { bookingId, type: 'message', senderName: msg.senderName, senderRole: msg.senderRole },
              'chat',
            ).catch(() => {});
          }
        }
      } catch {}
    });

    // Typing indicator — ephemeral, not persisted
    socket.on('typing', ({ bookingId, senderName, isTyping }) => {
      if (!bookingId) return;
      socket.to(`booking:${bookingId}`).emit('typing', { senderName, isTyping });
    });

    // ── Pre-booking inquiries — same shape as the booking-chat handlers
    // above, keyed by the (customerId, providerId) pair instead of a
    // bookingId since no booking exists yet. See the Message.bookingId
    // comment in schema.prisma.
    async function resolveInquiryPair(userId, otherUserId) {
      const [me, other] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
        prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true, role: true } }),
      ]);
      if (!me || !other) return null;
      if (me.role === 'Provider' && other.role === 'CUSTOMER') return { customerId: other.id, providerId: userId };
      if (me.role === 'CUSTOMER' && other.role === 'Provider') return { customerId: userId, providerId: other.id };
      return null;
    }

    socket.on('join-inquiry', async ({ otherUserId }) => {
      if (!otherUserId) return;
      try {
        const pair = await resolveInquiryPair(socket.userId, otherUserId);
        if (!pair) return;
        socket.join(`inquiry:${pair.customerId}:${pair.providerId}`);
      } catch {}
    });

    socket.on('send-inquiry-message', async ({ otherUserId, text }) => {
      if (!otherUserId || !text?.trim()) return;
      if (text.trim().length > 1000) return;
      try {
        const [pair, sender] = await Promise.all([
          resolveInquiryPair(socket.userId, otherUserId),
          prisma.user.findUnique({ where: { id: socket.userId }, select: { name: true, role: true } }),
        ]);
        if (!pair || !sender) return;

        const msg = await prisma.message.create({
          data: {
            customerId: pair.customerId,
            providerId: pair.providerId,
            senderId:   socket.userId,
            senderName: sender.name,
            senderRole: sender.role,
            text:       text.trim(),
          },
        });

        const payload = {
          _id:        msg.id,
          otherUserId,
          senderId:   socket.userId,
          senderName: msg.senderName,
          senderRole: msg.senderRole,
          text:       msg.text,
          createdAt:  msg.createdAt,
          read:       false,
        };
        io.to(`inquiry:${pair.customerId}:${pair.providerId}`).emit('new-inquiry-message', payload);

        const recipientId = socket.userId === pair.customerId ? pair.providerId : pair.customerId;
        if (recipientId) {
          io.to(`user-${recipientId}`).emit('inquiry-message-notification', { ...payload, otherUserId: socket.userId });
          const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { expoPushToken: true } });
          if (recipient?.expoPushToken) {
            pushTo(
              recipient.expoPushToken,
              `💬 ${msg.senderName}`,
              msg.text.slice(0, 100),
              { type: 'inquiry', otherUserId: socket.userId },
              'chat',
            ).catch(() => {});
          }
        }
      } catch {}
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

module.exports = { initSocket };
