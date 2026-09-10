const Notification = require('../models/Notification');
const webPush = require('./webPush');

// Unread notifications for one admin (read state is per-user via readBy).
async function unreadFor(userId) {
  try {
    const q = userId ? { readBy: { $ne: userId } } : {};
    return await Notification.countDocuments(q);
  } catch {
    return 0;
  }
}

// Fire-and-forget: dropping a notification must never break the flow that
// raised it (a checkout, a webhook). Returns the created doc (or null).
async function push({ type, title, body = '', severity = 'info', order = null, link = '', meta = null }) {
  let doc = null;
  try {
    doc = await Notification.create({ type, title, body, severity, order, link, meta });
  } catch (err) {
    console.error('notificationCenter.push failed:', err.message);
  }

  // Fan out to the admin PWA as a browser push (background/closed alerts with
  // sound + an app-icon badge showing that admin's unread count). Never blocks
  // or throws into the caller.
  webPush
    .notifyAll({
      title,
      body,
      url: link || '/',
      tag: type || 'lytronix',
      badge: (sub) => unreadFor(sub.user),
    })
    .catch((err) => console.error('notificationCenter.push webpush failed:', err.message));

  return doc;
}

module.exports = { push };
