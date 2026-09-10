const PushSubscription = require('../models/PushSubscription');
const webPush = require('../services/webPush');

const valid = (s) => s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth;

// GET /api/push/config   -> { enabled, publicKey }
exports.getConfig = (req, res) => {
  res.json({ enabled: webPush.isConfigured(), publicKey: webPush.publicKey() });
};

// POST /api/push/subscribe   { subscription }   (admin)
exports.subscribe = async (req, res) => {
  const sub = req.body?.subscription || req.body;
  if (!valid(sub)) return res.status(400).json({ message: 'Invalid push subscription.' });
  await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    {
      $set: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        audience: 'admin',
        user: req.user?._id || null,
        customerAccount: null,
        phone: '',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
};

// POST /api/push/customer/subscribe   { subscription }   (signed-in customer)
exports.customerSubscribe = async (req, res) => {
  if (!req.customer) return res.status(401).json({ message: 'Sign in to enable notifications.' });
  const sub = req.body?.subscription || req.body;
  if (!valid(sub)) return res.status(400).json({ message: 'Invalid push subscription.' });
  await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    {
      $set: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        audience: 'customer',
        user: null,
        customerAccount: req.customer._id,
        phone: String(req.customer.phone || '').replace(/\D/g, ''),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
};

// POST /api/push/unsubscribe   { endpoint }   (public — you can always drop your own)
exports.unsubscribe = async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint) await PushSubscription.deleteOne({ endpoint });
  res.json({ ok: true });
};

// POST /api/push/test   (admin) — push to this account's admin devices.
exports.test = async (req, res) => {
  await webPush.notifyAll({
    title: 'Lytronix — টেস্ট নোটিফিকেশন',
    body: 'পুশ নোটিফিকেশন ঠিকঠাক কাজ করছে ✅',
    url: '/',
    tag: 'test',
  });
  res.json({ ok: true, configured: webPush.isConfigured() });
};
