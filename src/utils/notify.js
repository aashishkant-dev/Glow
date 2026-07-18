// src/utils/notify.js
// Persist an in-app notification AND deliver a phone push in one call.
//
// Socket events (booking-status-changed, etc.) stay where they are — they drive
// the live in-app banner while the app is open. This helper adds the durable half:
// a Notification row so the bell/Notifications screen shows full history even when
// the app was closed at the moment the event fired, plus the Expo push so the
// device is woken.
const prisma = require('../lib/prisma');
const { pushTo } = require('./push');

/**
 * @param {object}   opts
 * @param {string}   opts.userId     recipient User.id
 * @param {string}   opts.type       booking | message | rating | request | job | approved | tip | cancelled
 * @param {string}   opts.title      notification title
 * @param {string}  [opts.body]      notification body
 * @param {string}  [opts.bookingId] related booking, for deep-linking
 * @param {string}  [opts.pushToken] recipient's expoPushToken (skip a DB lookup if you already have it)
 * @param {string}  [opts.channelId] Android channel ('default' | 'jobs' | 'requests' | 'chat')
 * @param {boolean} [opts.push=true] set false to persist only (no phone push)
 */
async function notify(opts) {
  const { userId, type = 'booking', title, body = '', bookingId, channelId = 'default', push = true } = opts;
  if (!userId || !title) return;

  // Persist (best-effort — never block the request on a notification write).
  await prisma.notification
    .create({ data: { userId, type, title, body, bookingId: bookingId ?? null } })
    .catch((e) => console.error('[notify] persist failed:', e?.message));

  if (!push) return;

  // Resolve the push token if the caller didn't pass one.
  let token = opts.pushToken;
  if (token === undefined) {
    const u = await prisma.user
      .findUnique({ where: { id: userId }, select: { expoPushToken: true } })
      .catch(() => null);
    token = u?.expoPushToken;
  }
  await pushTo(token, title, body, { type, bookingId: bookingId ?? '' }, channelId).catch(() => {});
}

module.exports = { notify };
