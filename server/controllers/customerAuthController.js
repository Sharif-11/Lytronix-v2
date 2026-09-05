const { customAlphabet } = require('nanoid');
const CustomerAccount = require('../models/CustomerAccount');
const OtpRequest = require('../models/OtpRequest');
const { signCustomerToken } = require('../middleware/customerAuth');
const sms = require('../services/sms');
const notifications = require('../services/notifications');

const OTP_LENGTH = Math.max(4, Math.min(8, Number(process.env.OTP_LENGTH || 6)));
const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000;
const MAX_SENDS_PER_HOUR = Number(process.env.OTP_MAX_SENDS_PER_HOUR || 5);
const MIN_RESEND_GAP_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000;

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
    // Reset the rolling window if it's older than an hour.
    if (now - new Date(otp.windowStartedAt).getTime() > WINDOW_MS) {
      otp.windowStartedAt = new Date();
      otp.sendCount = 0;
    }
    if (otp.lastSentAt && now - new Date(otp.lastSentAt).getTime() < MIN_RESEND_GAP_MS) {
      const wait = Math.ceil(
        (MIN_RESEND_GAP_MS - (now - new Date(otp.lastSentAt).getTime())) / 1000
      );
      return res.status(429).json({ message: `Please wait ${wait}s before requesting another code.` });
    }
    if (otp.sendCount >= MAX_SENDS_PER_HOUR) {
      return res.status(429).json({ message: 'Too many codes requested. Try again in about an hour.' });
    }
  } else {
    otp = new OtpRequest({ phone, windowStartedAt: new Date() });
  }

  const code = numeric();
  await otp.setCode(code);
  otp.expiresAt = new Date(now + OTP_TTL_MS);
  otp.attempts = 0;
  otp.consumedAt = null;
  otp.sendCount += 1;
  otp.lastSentAt = new Date();
  await otp.save();

  await notifications.notifyCustomerOtp(phone, code);

  const payload = { sent: true, expiresInSeconds: Math.round(OTP_TTL_MS / 1000) };
  // Dev convenience: when SMS isn't wired up, hand the code back so the flow
  // is still testable. Never in production.
  if (!sms.isConfigured() && process.env.NODE_ENV !== 'production') {
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

  const token = signCustomerToken(account);
  res.json({ token, customer: account.toSafeJSON() });
};
