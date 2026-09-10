const Notification = require('../models/Notification');
const webPush = require('./webPush');

// Fire-and-forget: dropping a notification must never break the flow that
// raised it (a checkout, a webhook). Returns the created doc (or null).
async function push({ type, title, body = '', severity = 'info', order = null, link = '', meta = null }) {
  let doc = null;
  try {
    doc = await Notification.create({ type, title, body, severity, order, link, meta });
  } catch (err) {
    console.error('notificationCenter.push failed:', err.message);
  }

  // Also fan out to the admin PWA as a browser push (background/closed alerts
  // with sound). Never blocks or throws into the caller.
  webPush
    .notifyAll({ title, body, url: link || '/', tag: type || 'lytronix' })
    .catch((err) => console.error('notificationCenter.push webpush failed:', err.message));

  return doc;
}

module.exports = { push };
