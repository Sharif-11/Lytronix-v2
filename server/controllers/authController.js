const jwt = require('jsonwebtoken');
const { customAlphabet } = require('nanoid');
const User = require('../models/User');
const notifications = require('../services/notifications');
const logger = require('../services/logger');

// Unambiguous alphabet (no 0/O/1/I/l) — same style as the tracking-code/slug
// generators elsewhere in the app — for one-time reset passwords read off an SMS.
const generatePassword = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz', 10);

const RESET_MIN_GAP_MS = 2 * 60 * 1000; // mirrors the OTP resend throttle

function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// POST /api/auth/login   { identifier, password }
// `identifier` is an email or a phone number — phone is the one field every
// admin account is guaranteed to have, so login can't depend on email alone.
async function login(req, res) {
  const identifier = String(req.body.identifier || req.body.email || '').trim();
  const { password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Email/phone and password are required.' });
  }

  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
  })
    .select('+passwordHash')
    .populate('role');

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  res.json({ token, user: user.toSafeJSON() });
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

// POST /api/auth/change-password
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  const ok = await user.comparePassword(currentPassword);
  if (!ok) {
    return res.status(401).json({ message: 'Current password is incorrect.' });
  }

  await user.setPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
  res.json({ message: 'Password updated.' });
}

// POST /api/auth/forgot-password   { identifier }
// Always responds with the same generic message, whether or not an account
// matched, so this can't be used to enumerate admin accounts. When a match
// is found (and isn't rate-limited), a brand new password is generated, set
// on the account, and texted to its phone — the same phone every admin
// account is required to have.
async function forgotPassword(req, res) {
  const identifier = String(req.body.identifier || '').trim();
  const generic = {
    message: 'If that account exists, a new password has been sent to its registered phone number.',
  };
  if (!identifier) return res.status(400).json({ message: 'Enter your email or phone number.' });

  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
  });

  if (!user || !user.isActive) {
    logger.info('auth.forgotPassword: no matching active account', { identifier });
    return res.json(generic);
  }

  if (user.lastPasswordResetAt && Date.now() - user.lastPasswordResetAt.getTime() < RESET_MIN_GAP_MS) {
    // Still return the generic message — don't leak timing/rate-limit state either.
    logger.info('auth.forgotPassword: rate-limited', { userId: user._id });
    return res.json(generic);
  }

  const newPassword = generatePassword();
  await user.setPassword(newPassword);
  user.mustChangePassword = true;
  user.lastPasswordResetAt = new Date();
  await user.save();

  try {
    await notifications.notifyAdminPasswordReset(user.phone, newPassword);
    logger.info('auth.forgotPassword: new password issued and SMS attempted', { userId: user._id });
  } catch (err) {
    logger.error('auth.forgotPassword: SMS send failed', { userId: user._id, error: err.message });
  }

  res.json(generic);
}

module.exports = { login, me, changePassword, forgotPassword };
