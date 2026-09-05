const ContactMessage = require('../models/ContactMessage');
const notificationCenter = require('../services/notificationCenter');
const logger = require('../services/logger');

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isBdPhone = (s) => /^01\d{9}$/.test(String(s).replace(/\D/g, ''));

// POST /api/contact  (public — storefront Contact page)
exports.submitContactMessage = async (req, res) => {
  const { name, phone, email, message, company } = req.body; // `company` = honeypot

  // A filled honeypot means a bot filled every input — pretend success.
  if (company) {
    return res.status(201).json({ message: 'Thanks — we will get back to you soon.' });
  }

  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanContact = String(phone || email || '').trim().slice(0, 120);
  const cleanMessage = String(message || '').trim().slice(0, 2000);

  if (!cleanContact || !cleanMessage) {
    return res.status(400).json({ message: 'Please include a way to reach you and your message.' });
  }

  const doc = await ContactMessage.create({
    name: cleanName,
    contact: cleanContact,
    email: isEmail(cleanContact) ? cleanContact : '',
    phone: isBdPhone(cleanContact) ? cleanContact.replace(/\D/g, '') : '',
    message: cleanMessage,
  });

  await notificationCenter.push({
    type: 'system',
    severity: 'info',
    title: `Contact message${cleanName ? ` from ${cleanName}` : ''}`,
    body: `${cleanContact} — ${cleanMessage}`,
    link: '/messages',
    meta: { messageId: String(doc._id), name: cleanName, contact: cleanContact },
  });

  logger.info('contact: message received', { id: String(doc._id), hasName: Boolean(cleanName) });
  res.status(201).json({ message: 'Thanks — we will get back to you soon.' });
};

// GET /api/contact  (admin)  ?status=new|read|archived&search=&page=&limit=
exports.listContactMessages = async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status && ['new', 'read', 'archived'].includes(status)) filter.status = status;
  if (search) {
    const re = { $regex: String(search).trim(), $options: 'i' };
    filter.$or = [{ name: re }, { contact: re }, { message: re }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [messages, total, unread] = await Promise.all([
    ContactMessage.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    ContactMessage.countDocuments(filter),
    ContactMessage.countDocuments({ status: 'new' }),
  ]);

  res.json({ messages, total, unread, page: pageNum, pages: Math.ceil(total / limitNum) || 1 });
};

// PATCH /api/contact/:id  { status }  (admin)
exports.updateContactMessage = async (req, res) => {
  const { status } = req.body;
  if (!['new', 'read', 'archived'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' });
  }
  const msg = await ContactMessage.findById(req.params.id);
  if (!msg) return res.status(404).json({ message: 'Message not found.' });

  msg.status = status;
  msg.handledBy = req.user?._id || null;
  msg.handledAt = new Date();
  await msg.save();
  res.json(msg);
};

// DELETE /api/contact/:id  (admin)
exports.deleteContactMessage = async (req, res) => {
  const deleted = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Message not found.' });
  res.json({ deleted: true });
};
