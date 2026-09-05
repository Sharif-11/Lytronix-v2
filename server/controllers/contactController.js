const notificationCenter = require('../services/notificationCenter');
const logger = require('../services/logger');

// POST /api/contact  (public — storefront Contact page)
// No dedicated collection: a message just becomes a Notification, so it
// shows up in the admin bell immediately instead of needing its own inbox.
exports.submitContactMessage = async (req, res) => {
  const { name, phone, email, message, company } = req.body; // `company` = honeypot

  // A filled honeypot field means a bot filled every input it could find —
  // pretend success without doing anything.
  if (company) {
    return res.status(201).json({ message: 'Thanks — we will get back to you soon.' });
  }

  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanContact = String(phone || email || '').trim().slice(0, 100);
  const cleanMessage = String(message || '').trim().slice(0, 2000);

  if (!cleanContact || !cleanMessage) {
    return res.status(400).json({ message: 'Please include a way to reach you and your message.' });
  }

  await notificationCenter.push({
    type: 'system',
    severity: 'info',
    title: `Contact message${cleanName ? ` from ${cleanName}` : ''}`,
    body: `${cleanContact} — ${cleanMessage}`,
    meta: { name: cleanName, contact: cleanContact, message: cleanMessage },
  });

  logger.info('contact: message received', { hasName: Boolean(cleanName) });

  res.status(201).json({ message: 'Thanks — we will get back to you soon.' });
};
