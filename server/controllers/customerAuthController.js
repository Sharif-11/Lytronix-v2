const { customAlphabet } = require('nanoid');
const CustomerAccount = require('../models/CustomerAccount');
const OtpRequest = require('../models/OtpRequest');
const { issueCustomerTokens, accountFromRefreshToken } = require('../middleware/customerAuth');
const sms = require('../services/sms');
const notifications = require('../services/notifications');

// Password sign-in throttle (no SMS cost, but still guard against guessing).
const PW_MAX_ATTEMPTS = 6;
const PW_WINDOW_MS = 15 * 60 * 1000;
const pwAttempts = new Map(); // phone -> { count, windowStartedAt }

// forgot-password: SMS costs money, so cap it hard per number.
const PW_RESET_MIN_GAP_MS = 2 * 60 * 1000;
const PW_RESET_MAX_PER_DAY = Math.max(1, Number(process.env.PW_RESET_MAX_PER_DAY || 3));

const OTP_LENGTH = Math.max(4, Math.min(8, Number(process.env.OTP_LENGTH || 6)));
const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000;
const MIN_RESEND_GAP_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

// SMS costs money — keep OTP requests tightly bounded per number:
//   • at most OTP_MAX_PER_DAY codes in any rolling 24h window, then a full
//     24h cool-down;
//   • at most OTP_MAX_LIFETIME codes ever — after that only an admin reset
//     (POST /api/customers/otp-reset) frees the number.
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DAY = Math.max(1, Number(process.env.OTP_MAX_PER_DAY || 2));
const MAX_LIFETIME = Math.max(MAX_PER_DAY, Number(process.env.OTP_MAX_LIFETIME || 5));

const numeric = customAlphabet('0123456789', OTP_LENGTH);

// A BD mobile number, normalised to 01XXXXXXXXX. Returns '' if it isn't one.
function normalisePhone(raw) {
  const n = sms.normalizeBdNumber(raw);
  return /^01\d{9}$/.test(n) ? n : '';
}

// POST /api/auth/customer/request-otp   { phone }
exports.requestOtp = async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  if (!phone) {
    return res.status(400).json({ message: 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX).' });
  }

  const now = Date.now();
  let otp = await OtpRequest.findOne({ phone });

  if (otp) {
    // Hard lifetime cap — only an admin reset lifts this.
    if ((otp.lifetimeCount || 0) >= MAX_LIFETIME) {
      return res.status(429).json({
        message:
          'এই নম্বরে সর্বোচ্চ সংখ্যকবার লগইন কোড চাওয়া হয়ে গেছে। সহায়তার জন্য আমাদের সাথে যোগাযোগ করুন।',
      });
    }
    // Roll the 24h window once it has fully elapsed.
    if (now - new Date(otp.windowStartedAt || 0).getTime() >= DAY_MS) {
      otp.windowStartedAt = new Date(now);
      otp.sendCount = 0;
      otp.blockedUntil = null;
    }
    // Inside a 24h cool-down?
    if (otp.blockedUntil && new Date(otp.blockedUntil).getTime() > now) {
      const hrs = Math.max(1, Math.ceil((new Date(otp.blockedUntil).getTime() - now) / (60 * 60 * 1000)));
      return res.status(429).json({
        message: `আজকের কোড চাওয়ার সীমা শেষ। প্রায় ${hrs} ঘণ্টা পরে আবার চেষ্টা করুন।`,
      });
    }
    // Minimum gap between two sends.
    if (otp.lastSentAt && now - new Date(otp.lastSentAt).getTime() < MIN_RESEND_GAP_MS) {
      const wait = Math.ceil((MIN_RESEND_GAP_MS - (now - new Date(otp.lastSentAt).getTime())) / 1000);
      return res.status(429).json({ message: `আবার কোড চাওয়ার আগে ${wait} সেকেন্ড অপেক্ষা করুন।` });
    }
    // Per-day cap reached (belt-and-braces if blockedUntil wasn't set).
    if ((otp.sendCount || 0) >= MAX_PER_DAY) {
      otp.blockedUntil = new Date(now + DAY_MS);
      await otp.save();
      return res.status(429).json({
        message: 'আজকের কোড চাওয়ার সীমা শেষ। ২৪ ঘণ্টা পরে আবার চেষ্টা করুন।',
      });
    }
  } else {
    otp = new OtpRequest({ phone, windowStartedAt: new Date(now), sendCount: 0, lifetimeCount: 0 });
  }

  const code = numeric();
  await otp.setCode(code);
  otp.expiresAt = new Date(now + OTP_TTL_MS);
  otp.attempts = 0;
  otp.consumedAt = null;
  otp.sendCount = (otp.sendCount || 0) + 1;
  otp.lifetimeCount = (otp.lifetimeCount || 0) + 1;
  otp.lastSentAt = new Date(now);
  // Hitting the per-day cap on this send starts the 24h cool-down.
  if (otp.sendCount >= MAX_PER_DAY) {
    otp.blockedUntil = new Date(now + DAY_MS);
  }
  await otp.save();

  await notifications.notifyCustomerOtp(phone, code);

  const payload = { sent: true, expiresInSeconds: Math.round(OTP_TTL_MS / 1000) };
  // Dev convenience: when no real SMS went out (gateway not configured, or
  // dev mock mode), hand the code back so the login flow is still testable.
  // Never in production.
  if (process.env.NODE_ENV !== 'production' && (!sms.isConfigured() || sms.isMocked())) {
    payload.devCode = code;
  }
  res.json(payload);
};

// POST /api/auth/customer/verify-otp   { phone, code }
exports.verifyOtp = async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  if (!phone || !code) {
    return res.status(400).json({ message: 'Phone number and code are required.' });
  }

  const otp = await OtpRequest.findOne({ phone });
  if (!otp || otp.consumedAt || otp.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'That code has expired. Please request a new one.' });
  }
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
  }

  const ok = await otp.compareCode(code);
  if (!ok) {
    otp.attempts += 1;
    await otp.save();
    const left = MAX_VERIFY_ATTEMPTS - otp.attempts;
    return res.status(400).json({
      message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code.',
    });
  }

  otp.consumedAt = new Date();
  await otp.save();

  let account = await CustomerAccount.findOne({ phone });
  if (!account) {
    account = new CustomerAccount({ phone });
  }
  if (account.isBlocked) {
    return res.status(403).json({ message: 'This account has been suspended. Contact support.' });
  }
  account.phoneVerified = true;
  account.isActive = true;
  account.lastLoginAt = new Date();
  await account.save();

  res.json({ ...issueCustomerTokens(account), customer: account.toSafeJSON() });
};

// POST /api/auth/customer/login   { phone, password }
// Password sign-in — lets a customer who has set a password skip the OTP
// (and its SMS cost) entirely. Generic errors, no account enumeration.
exports.passwordLogin = async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  const password = String(req.body.password || '');
  if (!phone || !password) {
    return res.status(400).json({ message: 'ফোন নম্বর ও পাসওয়ার্ড দিন।' });
  }

  const now = Date.now();
  const rec = pwAttempts.get(phone);
  if (rec && now - rec.windowStartedAt < PW_WINDOW_MS && rec.count >= PW_MAX_ATTEMPTS) {
    return res.status(429).json({ message: 'অনেকবার ভুল চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন অথবা ওয়ান-টাইম কোড ব্যবহার করুন।' });
  }

  const account = await CustomerAccount.findOne({ phone }).select('+passwordHash');
  const good = account && account.isActive && !account.isBlocked && (await account.comparePassword(password));

  if (!good) {
    const next = rec && now - rec.windowStartedAt < PW_WINDOW_MS
      ? { count: rec.count + 1, windowStartedAt: rec.windowStartedAt }
      : { count: 1, windowStartedAt: now };
    pwAttempts.set(phone, next);
    return res.status(401).json({ message: 'ফোন নম্বর বা পাসওয়ার্ড সঠিক নয়।' });
  }

  pwAttempts.delete(phone);
  account.lastLoginAt = new Date();
  await account.save();
  res.json({ ...issueCustomerTokens(account), customer: account.toSafeJSON() });
};

// POST /api/auth/customer/refresh   { refreshToken }
// Trades a valid refresh token for a fresh access token (keeps the session
// alive across the short access-token expiry without another sign-in).
exports.refreshSession = async (req, res) => {
  const account = await accountFromRefreshToken(req.body.refreshToken);
  if (!account) {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
  res.json({ ...issueCustomerTokens(account), customer: account.toSafeJSON() });
};

// POST /api/auth/customer/forgot-password   { phone }
// Generates a fresh 6-digit password (first digit non-zero), texts it, and
// signs every existing session out. Always the same generic response.
exports.forgotPassword = async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  const generic = { sent: true, message: 'যদি এই নম্বরে অ্যাকাউন্ট থাকে, নতুন পাসওয়ার্ড এসএমএসে পাঠানো হয়েছে।' };
  if (!phone) {
    return res.status(400).json({ message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)।' });
  }

  const account = await CustomerAccount.findOne({ phone });
  if (!account || account.isBlocked) {
    return res.json(generic); // no enumeration
  }

  const now = Date.now();
  if (account.lastPasswordResetAt && now - new Date(account.lastPasswordResetAt).getTime() < PW_RESET_MIN_GAP_MS) {
    return res.json(generic); // silently rate-limited
  }
  const windowFresh =
    !account.passwordResetWindowStartedAt ||
    now - new Date(account.passwordResetWindowStartedAt).getTime() >= DAY_MS;
  if (windowFresh) {
    account.passwordResetWindowStartedAt = new Date(now);
    account.passwordResetCount = 0;
  }
  if ((account.passwordResetCount || 0) >= PW_RESET_MAX_PER_DAY) {
    return res.json(generic); // daily cap hit — stay generic
  }

  const newPassword = CustomerAccount.generateNumericPassword();
  await account.setPassword(newPassword, { temp: true });
  account.tokenVersion = (account.tokenVersion || 0) + 1; // sign out everywhere
  account.lastPasswordResetAt = new Date(now);
  account.passwordResetCount = (account.passwordResetCount || 0) + 1;
  await account.save();

  notifications.notifyCustomerPasswordReset(phone, newPassword).catch(() => {});

  const payload = { ...generic };
  if (process.env.NODE_ENV !== 'production' && (!sms.isConfigured() || sms.isMocked())) {
    payload.devPassword = newPassword;
  }
  res.json(payload);
};

// POST /api/customers/otp-reset   { phone }   (admin only)
// Clears every OTP rate-limit counter for a number — the daily cap, the 24h
// cool-down and the lifetime cap — so the customer can request codes again.
exports.resetOtpLimit = async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  if (!phone) {
    return res.status(400).json({ message: 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX).' });
  }
  const deleted = await OtpRequest.deleteOne({ phone });
  res.json({ reset: true, hadRecord: deleted.deletedCount > 0, phone });
};

// GET /api/customers/otp-status?phone=01XXXXXXXXX   (admin only)
// Lets the admin see where a number stands before deciding to reset it.
exports.getOtpStatus = async (req, res) => {
  const phone = normalisePhone(req.query.phone);
  if (!phone) {
    return res.status(400).json({ message: 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX).' });
  }
  const otp = await OtpRequest.findOne({ phone }).lean();
  if (!otp) {
    return res.json({ phone, exists: false, sentToday: 0, lifetimeCount: 0, blockedUntil: null, maxPerDay: MAX_PER_DAY, maxLifetime: MAX_LIFETIME });
  }
  const now = Date.now();
  const windowElapsed = now - new Date(otp.windowStartedAt || 0).getTime() >= DAY_MS;
  res.json({
    phone,
    exists: true,
    sentToday: windowElapsed ? 0 : otp.sendCount || 0,
    lifetimeCount: otp.lifetimeCount || 0,
    blockedUntil: otp.blockedUntil && new Date(otp.blockedUntil).getTime() > now ? otp.blockedUntil : null,
    lifetimeExhausted: (otp.lifetimeCount || 0) >= MAX_LIFETIME,
    lastSentAt: otp.lastSentAt || null,
    maxPerDay: MAX_PER_DAY,
    maxLifetime: MAX_LIFETIME,
  });
};
