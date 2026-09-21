const crypto = require('crypto');
const SmsDevice = require('../models/SmsDevice');
const SmsPairingCode = require('../models/SmsPairingCode');
const IncomingSms = require('../models/IncomingSms');
const { ingest, settle } = require('../services/smsPaymentMatcher');
const { knownSenders } = require('../services/smsParsers');
const SmsListenerSettings = require('../models/SmsListenerSettings');
const logger = require('../services/logger');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// No 0/O/1/I so a code read off a screen can't be mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_BATCH = 100;

function newPairingCode() {
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// Tiny in-memory throttle for the unauthenticated pairing endpoint (guessing
// an 8-character code is already impractical; this just makes it hopeless).
const attempts = new Map();
function pairingThrottled(ip) {
  const now = Date.now();
  const rec = (attempts.get(ip) || []).filter((t) => now - t < 60 * 1000);
  rec.push(now);
  attempts.set(ip, rec);
  if (attempts.size > 5000) attempts.clear();
  return rec.length > 8;
}

// ---------------- admin (signed-in, payments:manage) ----------------

// POST /api/sms-listener/pairing-codes
exports.createPairingCode = async (req, res) => {
  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await SmsPairingCode.create({ codeHash: sha256(code), createdBy: req.user._id, expiresAt });
  res.status(201).json({ code, expiresAt });
};

// GET /api/sms-listener/devices
exports.listDevices = async (req, res) => {
  const devices = await SmsDevice.find().sort({ createdAt: -1 }).select('-tokenHash').lean();
  const settings = await SmsListenerSettings.load();
  res.json({ devices, senders: knownSenders(), testUntil: settings.testUntil });
};

// POST /api/sms-listener/test-mode  { minutes }   (0 = switch off; at most 30)
exports.setTestMode = async (req, res) => {
  const minutes = Math.min(30, Math.max(0, parseInt(req.body?.minutes, 10) || 0));
  const settings = await SmsListenerSettings.load();
  settings.testUntil = minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000) : null;
  await settings.save();
  res.json({ testUntil: settings.testUntil });
};

// DELETE /api/sms-listener/devices/:id  — the phone is refused from now on.
exports.revokeDevice = async (req, res) => {
  const device = await SmsDevice.findByIdAndUpdate(req.params.id, { revokedAt: new Date() }, { new: true }).select('-tokenHash');
  if (!device) return res.status(404).json({ message: 'Device not found.' });
  res.json(device);
};

// GET /api/sms-listener/messages?status=&limit=
exports.listMessages = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const messages = await IncomingSms.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('device', 'name')
    .populate('order', 'orderNumber')
    .lean();
  res.json({ messages });
};

// POST /api/sms-listener/messages/:id/match — re-run matching (e.g. after the order arrived late).
exports.rematch = async (req, res) => {
  const sms = await IncomingSms.findById(req.params.id);
  if (!sms) return res.status(404).json({ message: 'Message not found.' });
  if (sms.status === 'verified') return res.status(409).json({ message: 'Already verified.' });
  if (!sms.parsed?.trxId) return res.status(400).json({ message: 'This message has no bKash TrxID to match.' });
  await settle(sms);
  res.json(sms);
};

// ---------------- the phone ----------------

// POST /api/sms-listener/pair  { code, deviceName, appVersion }   (public)
exports.pair = async (req, res) => {
  if (pairingThrottled(req.ip)) return res.status(429).json({ message: 'Too many attempts. Wait a minute.' });

  const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) return res.status(400).json({ message: 'Enter the 8-character pairing code.' });

  // Atomic: one code, one device.
  const pc = await SmsPairingCode.findOneAndUpdate(
    { codeHash: sha256(code), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!pc) return res.status(400).json({ message: 'That code is invalid or has expired. Generate a new one.' });

  const token = crypto.randomBytes(32).toString('base64url');
  const device = await SmsDevice.create({
    name: String(req.body?.deviceName || 'Android phone').slice(0, 80),
    tokenHash: sha256(token),
    pairedBy: pc.createdBy,
    appVersion: String(req.body?.appVersion || '').slice(0, 20),
    lastSeenAt: new Date(),
    lastIp: req.ip || '',
  });
  pc.device = device._id;
  await pc.save();

  logger.info('sms-listener: device paired', { deviceId: String(device._id), name: device.name });
  // The token is shown exactly once; only its hash is kept.
  res.status(201).json({ deviceId: device._id, deviceToken: token, senders: knownSenders() });
};

// Middleware: identifies the phone by its bearer token.
exports.deviceAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Missing device token.' });
  const device = await SmsDevice.findOne({ tokenHash: sha256(token) });
  if (!device || device.revokedAt) return res.status(401).json({ message: 'This device is not paired (or was revoked).' });
  device.lastSeenAt = new Date();
  device.lastIp = req.ip || '';
  device.save().catch(() => {});
  req.smsDevice = device;
  next();
};

// POST /api/sms-listener/messages  { messages: [{ clientId, sender, body, receivedAt }] }
// Replies with one result per message so the phone can drop everything the
// server has now taken responsibility for.
exports.receive = async (req, res) => {
  const list = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (list.length === 0) return res.json({ results: [] });
  if (list.length > MAX_BATCH) return res.status(413).json({ message: `Send at most ${MAX_BATCH} messages at a time.` });

  const results = [];
  for (const raw of list) {
    const clientId = String(raw?.clientId || '').slice(0, 80);
    const sender = String(raw?.sender || '').slice(0, 64);
    const body = String(raw?.body || '').slice(0, 2000);
    const at = new Date(raw?.receivedAt);
    if (!clientId || !body || Number.isNaN(at.getTime())) {
      results.push({ clientId, status: 'rejected' }); // malformed — retrying can't help
      continue;
    }
    // A clock far in the future would just be wrong; clamp to now.
    const receivedAt = at.getTime() > Date.now() + 5 * 60 * 1000 ? new Date() : at;
    try {
      results.push(await ingest(req.smsDevice, { clientId, sender, body, receivedAt }));
    } catch (err) {
      logger.error('sms-listener: ingest failed', { error: err.message });
      // Not acknowledged: the phone keeps it and tries again later.
      results.push({ clientId, status: 'retry' });
    }
  }
  res.json({ results });
};
