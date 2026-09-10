const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const CustomerAccount = require('../models/CustomerAccount');
const notificationCenter = require('../services/notificationCenter');
const webPush = require('../services/webPush');
const logger = require('../services/logger');
const sms = require('../services/sms');

const MAX_BODY = 4000;
// The customer always sees replies as coming from the brand — never an
// individual staff member's name or number.
const BRAND_SENDER = 'Lytronix';
const normPhone = (raw) => {
  const n = sms.normalizeBdNumber(raw || '');
  return /^01\d{9}$/.test(n) ? n : '';
};

// Strip staff identity from admin messages before they reach the customer.
function forCustomer(messages) {
  return messages.map((m) =>
    m.from === 'admin' ? { ...m, senderName: BRAND_SENDER } : m
  );
}

// Pull the media/text fields off a send request into a message payload.
function contentFrom(reqBody) {
  const type = ['image', 'voice'].includes(reqBody.type) ? reqBody.type : 'text';
  const body = String(reqBody.body || '').trim().slice(0, MAX_BODY);
  const mediaUrl = type === 'text' ? '' : String(reqBody.mediaUrl || '').trim();
  if (type !== 'text' && !/^https?:\/\//.test(mediaUrl)) return { error: 'A valid attachment URL is required.' };
  if (type === 'text' && !body) return { error: 'মেসেজ লিখুন।' };
  return {
    type,
    body,
    mediaUrl,
    mediaMime: type === 'text' ? '' : String(reqBody.mediaMime || '').slice(0, 80),
    durationSec: type === 'voice' ? Math.max(0, Math.min(600, Number(reqBody.durationSec) || 0)) : 0,
  };
}

const previewFor = (c) => {
  if (c.deletedAt) return 'এই মেসেজটি মুছে ফেলা হয়েছে';
  return c.type === 'image' ? '📷 ছবি' : c.type === 'voice' ? '🎤 ভয়েস মেসেজ' : String(c.body || '').slice(0, 120);
};

// Rows the caller doesn't have yet: brand-new ones (`_id > after`) plus any
// whose delivery/read/edit/delete state changed since (`updatedAt > updatedAfter`).
// Both cursors optional; with neither, returns the whole thread (capped).
async function messagesSince(thread, { after, updatedAfter } = {}) {
  const ors = [];
  if (after && /^[a-f\d]{24}$/i.test(String(after))) ors.push({ _id: { $gt: after } });
  if (updatedAfter) {
    const d = new Date(updatedAfter);
    if (!Number.isNaN(d.getTime())) ors.push({ updatedAt: { $gt: d } });
  }
  const q = { thread: thread._id };
  if (ors.length === 1) Object.assign(q, ors[0]);
  else if (ors.length > 1) q.$or = ors;
  return ChatMessage.find(q).sort({ createdAt: 1 }).limit(200).lean();
}

// Re-derive a thread's list-preview fields from its newest live message.
async function refreshThreadPreview(thread) {
  const newest = await ChatMessage.findOne({ thread: thread._id, deletedAt: null })
    .sort({ createdAt: -1 })
    .lean();
  if (newest) {
    thread.lastMessageAt = newest.createdAt;
    thread.lastMessagePreview = previewFor(newest);
    thread.lastMessageFrom = newest.from;
  } else {
    thread.lastMessagePreview = '';
    thread.lastMessageFrom = '';
  }
  await thread.save();
}

// Load a message the caller is allowed to edit/delete: it must be in this
// thread and sent by this side, and not already deleted.
async function loadOwnMessage({ threadId, id, from }) {
  if (!/^[a-f\d]{24}$/i.test(String(id || ''))) return { error: 400, message: 'Invalid message id.' };
  const msg = await ChatMessage.findById(id);
  if (!msg || String(msg.thread) !== String(threadId)) return { error: 404, message: 'Message not found.' };
  if (msg.from !== from) return { error: 403, message: 'You can only change your own messages.' };
  if (msg.deletedAt) return { error: 409, message: 'This message was already deleted.' };
  return { msg };
}

async function applyEdit(msg, thread, rawBody) {
  if (msg.type !== 'text') return { error: 400, message: 'Only text messages can be edited.' };
  const body = String(rawBody || '').trim().slice(0, MAX_BODY);
  if (!body) return { error: 400, message: 'মেসেজ লিখুন।' };
  msg.body = body;
  msg.editedAt = new Date();
  await msg.save();
  const newest = await ChatMessage.findOne({ thread: thread._id, deletedAt: null }).sort({ createdAt: -1 }).select('_id').lean();
  if (newest && String(newest._id) === String(msg._id)) {
    thread.lastMessagePreview = previewFor(msg);
    await thread.save();
  }
  return {};
}

async function applyDelete(msg, thread) {
  if (msg.mediaUrl) {
    await require('../services/cloudinary').destroyByUrl(msg.mediaUrl).catch(() => {});
  }
  msg.deletedAt = new Date();
  msg.body = '';
  msg.mediaUrl = '';
  msg.mediaMime = '';
  msg.durationSec = 0;
  await msg.save();
  await refreshThreadPreview(thread);
}

// ---------------------------------------------------------------------------
// Customer side (storefront widget)
// ---------------------------------------------------------------------------

// POST /api/chat/start   { phone?, name? }
// A logged-in customer's phone comes from their token; a guest supplies it.
// Returns the thread id + guestKey the widget stores locally.
exports.startChat = async (req, res) => {
  const phone = req.customer?.phone || normPhone(req.body.phone);
  if (!phone) {
    return res.status(400).json({ message: 'একটি সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)।' });
  }
  const name = String(req.body.name || req.customer?.name || '').trim().slice(0, 80);

  let thread = await ChatThread.findOne({ phone });
  if (!thread) {
    thread = await ChatThread.create({
      phone,
      name,
      customerAccount: req.customer?._id || null,
    });
  } else if (name && !thread.name) {
    thread.name = name;
    await thread.save();
  }

  res.json({ threadId: String(thread._id), phone, guestKey: thread.guestKey, name: thread.name });
};

// Resolve + authorise a customer request against a thread.
async function customerThread(req) {
  const phone = req.customer?.phone || normPhone(req.query.phone || req.body.phone);
  if (!phone) return { error: 400, message: 'একটি সঠিক মোবাইল নম্বর দিন।' };
  const thread = await ChatThread.findOne({ phone });
  if (!thread) return { error: 404, message: 'চ্যাট খুঁজে পাওয়া যায়নি।' };
  const key = req.query.guestKey || req.body.guestKey;
  const ok = (req.customer && req.customer.phone === phone) || key === thread.guestKey;
  if (!ok) return { error: 403, message: 'অননুমোদিত।' };
  return { thread };
}

// GET /api/chat/messages?phone=&guestKey=&after=&updatedAfter=&seen=1
exports.customerMessages = async (req, res) => {
  const r = await customerThread(req);
  if (r.error) return res.status(r.error).json({ message: r.message });
  const thread = r.thread;
  const seen = req.query.seen === '1' || req.query.seen === 'true';

  // The customer's device now holds every admin message up to now → delivered.
  await ChatMessage.updateMany(
    { thread: thread._id, from: 'admin', deliveredToCustomer: false },
    { deliveredToCustomer: true }
  );
  // Widget actually open (seen=1) → read, so the admin gets blue ticks.
  if (seen) {
    await ChatMessage.updateMany(
      { thread: thread._id, from: 'admin', readByCustomer: false },
      { readByCustomer: true }
    );
    if (thread.unreadForCustomer !== 0) {
      thread.unreadForCustomer = 0;
      await thread.save();
    }
  }

  const messages = forCustomer(
    await messagesSince(thread, { after: req.query.after, updatedAfter: req.query.updatedAfter })
  );
  res.json({ messages, unreadForCustomer: thread.unreadForCustomer });
};

// POST /api/chat/send   { phone?, guestKey?, body?, type?, mediaUrl?, mediaMime?, durationSec? }
exports.customerSend = async (req, res) => {
  const c = contentFrom(req.body);
  if (c.error) return res.status(400).json({ message: c.error });

  const r = await customerThread(req);
  if (r.error) return res.status(r.error).json({ message: r.message });
  const thread = r.thread;

  const msg = await ChatMessage.create({
    thread: thread._id,
    phone: thread.phone,
    from: 'customer',
    senderName: thread.name || '',
    ...c,
    readByCustomer: true,
    deliveredToCustomer: true,
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = previewFor(c);
  thread.lastMessageFrom = 'customer';
  thread.unreadForAdmin += 1;
  if (thread.status === 'closed') thread.status = 'open';
  await thread.save();

  // Nudge the admin bell — but not on every single message: only when this
  // is the first unread, so a burst doesn't spam the feed. (notificationCenter
  // also fires one Web Push here.)
  const pushTitle = `নতুন চ্যাট মেসেজ${thread.name ? ` — ${thread.name}` : ''}`;
  const pushBody = `${thread.phone}: ${previewFor(c)}`;
  const chatLink = `/chat?phone=${thread.phone}`;
  if (thread.unreadForAdmin === 1) {
    notificationCenter.push({
      type: 'chat',
      severity: 'info',
      title: pushTitle,
      body: pushBody,
      link: chatLink,
      meta: { phone: thread.phone },
    });
  } else {
    // Follow-up messages skip the bell feed but still push — a live
    // conversation wants a ping per message.
    webPush
      .notifyAll({ title: pushTitle, body: pushBody, url: chatLink, tag: `chat-${thread.phone}` })
      .catch(() => {});
  }

  logger.info('chat: customer message', { phoneLast4: thread.phone.slice(-4), type: c.type });
  res.status(201).json({ message: msg });
};

// POST /api/chat/upload  (multipart: file) — image or voice note.
// Scoped: an admin bearer token, a customer bearer token whose phone
// matches, or a guestKey that matches an existing thread.
exports.uploadMedia = async (req, res) => {
  const cloudinary = require('../services/cloudinary');
  if (!req.file) return res.status(400).json({ message: 'No file received.' });

  let allowed = false;

  // 1) admin bearer token
  try {
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    const hdr = req.headers.authorization || '';
    const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (tok) {
      const d = jwt.verify(tok, process.env.JWT_SECRET);
      if (d && d.id) {
        const u = await User.findById(d.id);
        if (u && u.isActive) allowed = true;
      }
    }
  } catch {
    /* not an admin token — fall through */
  }

  // 2) customer token / guestKey
  if (!allowed) {
    const phone = req.customer?.phone || normPhone(req.body.phone);
    if (phone) {
      const thread = await ChatThread.findOne({ phone });
      allowed =
        (req.customer && req.customer.phone === phone) ||
        (thread && req.body.guestKey && req.body.guestKey === thread.guestKey);
    }
  }
  if (!allowed) return res.status(403).json({ message: 'অননুমোদিত।' });

  try {
    const { url } = await cloudinary.uploadChatMedia(req.file.buffer, req.file.mimetype, 'lytronix/chat');
    res.status(201).json({ url, mime: req.file.mimetype });
  } catch (err) {
    res.status(err.statusCode || 502).json({ message: err.message || 'Upload failed.' });
  }
};

// ---------------------------------------------------------------------------
// Admin side
// ---------------------------------------------------------------------------

// GET /api/chat/threads?search=&status=
exports.listThreads = async (req, res) => {
  const { search, status } = req.query;
  const filter = {};
  if (status === 'open' || status === 'closed') filter.status = status;
  if (search) {
    const re = { $regex: String(search).trim(), $options: 'i' };
    filter.$or = [{ phone: re }, { name: re }, { lastMessagePreview: re }];
  }
  const threads = await ChatThread.find(filter).sort({ lastMessageAt: -1 }).limit(200).lean();
  const totalUnread = threads.reduce((s, t) => s + (t.unreadForAdmin || 0), 0);
  res.json({ threads, totalUnread });
};

async function adminThread(phone) {
  const p = normPhone(phone);
  if (!p) return null;
  return ChatThread.findOne({ phone: p });
}

// GET /api/chat/threads/:phone/messages?after=&updatedAfter=
// The admin only polls this while the conversation is on screen, so a
// customer message returned here is both delivered and read.
exports.adminMessages = async (req, res) => {
  const thread = await adminThread(req.params.phone);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });

  await ChatMessage.updateMany(
    { thread: thread._id, from: 'customer', deliveredToAdmin: false },
    { deliveredToAdmin: true }
  );
  await ChatMessage.updateMany(
    { thread: thread._id, from: 'customer', readByAdmin: false },
    { readByAdmin: true }
  );
  if (thread.unreadForAdmin !== 0) {
    thread.unreadForAdmin = 0;
    await thread.save();
  }

  const messages = await messagesSince(thread, { after: req.query.after, updatedAfter: req.query.updatedAfter });
  res.json({ messages, thread: { phone: thread.phone, name: thread.name, status: thread.status, unreadForAdmin: 0 } });
};

// POST /api/chat/threads/:phone/messages   { body }
exports.adminSend = async (req, res) => {
  const thread = await adminThread(req.params.phone);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });

  const c = contentFrom(req.body);
  if (c.error) return res.status(400).json({ message: c.error });

  const msg = await ChatMessage.create({
    thread: thread._id,
    phone: thread.phone,
    from: 'admin',
    senderName: req.user?.name || 'Support',
    ...c,
    readByAdmin: true,
    deliveredToAdmin: true,
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = previewFor(c);
  thread.lastMessageFrom = 'admin';
  thread.unreadForCustomer += 1;
  await thread.save();

  // Ping the shopper's PWA about the reply.
  webPush
    .notifyCustomer(thread.phone, {
      title: 'Lytronix — নতুন বার্তা',
      body: previewFor(c),
      url: '/shop?chat=1',
      tag: `chat-${thread.phone}`,
    })
    .catch(() => {});

  res.status(201).json({ message: msg });
};

// PATCH /api/chat/threads/:phone/messages/:id   { body }   — edit own text
exports.adminEditMessage = async (req, res) => {
  const thread = await adminThread(req.params.phone);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  const m = await loadOwnMessage({ threadId: thread._id, id: req.params.id, from: 'admin' });
  if (m.error) return res.status(m.error).json({ message: m.message });
  const out = await applyEdit(m.msg, thread, req.body.body);
  if (out.error) return res.status(out.error).json({ message: out.message });
  res.json({ message: m.msg.toObject() });
};

// DELETE /api/chat/threads/:phone/messages/:id   — soft-delete own message
exports.adminDeleteMessage = async (req, res) => {
  const thread = await adminThread(req.params.phone);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  const m = await loadOwnMessage({ threadId: thread._id, id: req.params.id, from: 'admin' });
  if (m.error) return res.status(m.error).json({ message: m.message });
  await applyDelete(m.msg, thread);
  res.json({ message: m.msg.toObject() });
};

// PATCH /api/chat/messages/:id   { phone?, guestKey?, body }   — customer edits own text
exports.customerEditMessage = async (req, res) => {
  const r = await customerThread(req);
  if (r.error) return res.status(r.error).json({ message: r.message });
  const m = await loadOwnMessage({ threadId: r.thread._id, id: req.params.id, from: 'customer' });
  if (m.error) return res.status(m.error).json({ message: m.message });
  const out = await applyEdit(m.msg, r.thread, req.body.body);
  if (out.error) return res.status(out.error).json({ message: out.message });
  res.json({ message: forCustomer([m.msg.toObject()])[0] });
};

// DELETE /api/chat/messages/:id   { phone?, guestKey? }   — customer deletes own message
exports.customerDeleteMessage = async (req, res) => {
  const r = await customerThread(req);
  if (r.error) return res.status(r.error).json({ message: r.message });
  const m = await loadOwnMessage({ threadId: r.thread._id, id: req.params.id, from: 'customer' });
  if (m.error) return res.status(m.error).json({ message: m.message });
  await applyDelete(m.msg, r.thread);
  res.json({ message: m.msg.toObject() });
};

// PATCH /api/chat/threads/:phone   { status }
exports.updateThread = async (req, res) => {
  const thread = await adminThread(req.params.phone);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  if (['open', 'closed'].includes(req.body.status)) thread.status = req.body.status;
  await thread.save();
  res.json({ phone: thread.phone, status: thread.status });
};
