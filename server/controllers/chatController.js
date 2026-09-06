const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const CustomerAccount = require('../models/CustomerAccount');
const notificationCenter = require('../services/notificationCenter');
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

const previewFor = (c) =>
  c.type === 'image' ? '📷 ছবি' : c.type === 'voice' ? '🎤 ভয়েস মেসেজ' : c.body.slice(0, 120);

// Rows since `after` (a message _id or an ISO timestamp), oldest first.
async function messagesSince(thread, after) {
  const q = { thread: thread._id };
  if (after) {
    if (/^[a-f\d]{24}$/i.test(String(after))) q._id = { $gt: after };
    else {
      const d = new Date(after);
      if (!Number.isNaN(d.getTime())) q.createdAt = { $gt: d };
    }
  }
  return ChatMessage.find(q).sort({ createdAt: 1 }).limit(200).lean();
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

// GET /api/chat/messages?phone=&guestKey=&after=
exports.customerMessages = async (req, res) => {
  const r = await customerThread(req);
  if (r.error) return res.status(r.error).json({ message: r.message });

  const messages = forCustomer(await messagesSince(r.thread, req.query.after));

  // Opening the widget = the customer has seen everything so far.
  if (!req.query.after || r.thread.unreadForCustomer > 0) {
    await ChatMessage.updateMany(
      { thread: r.thread._id, from: 'admin', readByCustomer: false },
      { readByCustomer: true }
    );
    if (r.thread.unreadForCustomer !== 0) {
      r.thread.unreadForCustomer = 0;
      await r.thread.save();
    }
  }

  res.json({ messages, unreadForCustomer: 0 });
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
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = previewFor(c);
  thread.lastMessageFrom = 'customer';
  thread.unreadForAdmin += 1;
  if (thread.status === 'closed') thread.status = 'open';
  await thread.save();

  // Nudge the admin bell — but not on every single message: only when this
  // is the first unread, so a burst doesn't spam the feed.
  if (thread.unreadForAdmin === 1) {
    notificationCenter.push({
      type: 'chat',
      severity: 'info',
      title: `নতুন চ্যাট মেসেজ${thread.name ? ` — ${thread.name}` : ''}`,
      body: `${thread.phone}: ${previewFor(c)}`,
      link: `/chat?phone=${thread.phone}`,
      meta: { phone: thread.phone },
    });
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

// GET /api/chat/threads/:phone/messages?after=
exports.adminMessages = async (req, res) => {
  const thread = await adminThread(req.params.phone);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });

  const messages = await messagesSince(thread, req.query.after);

  if (!req.query.after || thread.unreadForAdmin > 0) {
    await ChatMessage.updateMany(
      { thread: thread._id, from: 'customer', readByAdmin: false },
      { readByAdmin: true }
    );
    if (thread.unreadForAdmin !== 0) {
      thread.unreadForAdmin = 0;
      await thread.save();
    }
  }

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
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = previewFor(c);
  thread.lastMessageFrom = 'admin';
  thread.unreadForCustomer += 1;
  await thread.save();

  res.status(201).json({ message: msg });
};

// PATCH /api/chat/threads/:phone   { status }
exports.updateThread = async (req, res) => {
  const thread = await adminThread(req.params.phone);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  if (['open', 'closed'].includes(req.body.status)) thread.status = req.body.status;
  await thread.save();
  res.json({ phone: thread.phone, status: thread.status });
};
