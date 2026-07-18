// src/utils/push.js
/**
 * Send one or more Expo push notifications.
 * Pass a single message object or an array (max 100 per batch).
 * Silently swallows errors — push is best-effort.
 *
 * Android requirements (API 26+):
 *  - `channelId` must match a channel registered on the device by expo-notifications
 *    or the OS silently drops the notification.
 *  - `priority: 'high'` is required to wake the device from Doze / App Standby.
 * iOS: `sound: 'default'` triggers the system alert sound.
 */
async function sendPush(messages) {
  const batch = Array.isArray(messages) ? messages : [messages];
  if (!batch.length) return;
  // Apply Android delivery defaults to any message that doesn't override them.
  const enriched = batch.map(msg => ({
    channelId: 'default', // Must match a channel registered in the app.
    priority:  'high',    // FCM high priority — wakes device from Doze; iOS alert priority.
    sound:     'default',
    ...msg,               // Caller can override channelId/priority per-message.
  }));
  await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(enriched),
  }).catch(() => {});
}

/**
 * Convenience: send to a single token.
 * Skips silently if token is falsy.
 * Pass channelId to route to a specific Android channel ('jobs', 'requests', 'chat').
 * Defaults to 'default'.
 */
async function pushTo(token, title, body, data = {}, channelId = 'default') {
  if (!token) return;
  return sendPush({ to: token, title, body, data, channelId });
}

module.exports = { sendPush, pushTo };
