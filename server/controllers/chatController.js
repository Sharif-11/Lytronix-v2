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

// POST /api/chat/send   { phone?, guestKey?, body }
exports.customerSend = async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, MAX_BODY);
  if (!body) return res.status(400).json({ message: 'মেসেজ লিখুন।' });

  const r = await customerThread(req);
  if (r.error) return res.status(r.error).json({ message: r.message });
  const thread = r.thread;

  const msg = await ChatMessage.create({
    thread: thread._id,
    phone: thread.phone,
    from: 'customer',
    senderName: thread.name || '',
    body,
    readByCustomer: true,
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = body.slice(0, 120);
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
      body: `${thread.phone}: ${body.slice(0, 120)}`,
      link: `/chat?phone=${thread.phone}`,
      meta: { phone: thread.phone },
    });
  }

  logger.info('chat: customer message', { phoneLast4: thread.phone.slice(-4) });
  res.status(201).json({ message: msg });
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

  const body = String(req.body.body || '').trim().slice(0, MAX_BODY);
  if (!body) return res.status(400).json({ message: 'Message body is required.' });

  const msg = await ChatMessage.create({
    thread: thread._id,
    phone: thread.phone,
    from: 'admin',
    senderName: req.user?.name || 'Support',
    body,
    readByAdmin: true,
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = body.slice(0, 120);
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
