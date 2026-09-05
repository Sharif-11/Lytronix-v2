const Notification = require('../models/Notification');

// Fire-and-forget: dropping a notification must never break the flow that
// raised it (a checkout, a webhook). Returns the created doc (or null).
async function push({ type, title, body = '', severity = 'info', order = null, link = '', meta = null }) {
  try {
    return await Notification.create({ type, title, body, severity, order, link, meta });
  } catch (err) {
    console.error('notificationCenter.push failed:', err.message);
    return null;
  }
}

module.exports = { push };
