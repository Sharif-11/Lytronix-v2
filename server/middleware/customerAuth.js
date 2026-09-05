const jwt = require('jsonwebtoken');
const CustomerAccount = require('../models/CustomerAccount');

// Storefront customer sessions are a short-lived access token plus a
// long-lived refresh token. Both carry a `typ` claim so they can't be
// confused with admin tokens or with each other, and a `ver` claim matched
// against CustomerAccount.tokenVersion — bump that field to sign every
// existing session out (password change / reset / block).
const ACCESS_TTL = process.env.JWT_CUSTOMER_ACCESS_EXPIRES_IN || '1h';
const REFRESH_TTL = process.env.JWT_CUSTOMER_REFRESH_EXPIRES_IN || '90d';

function signCustomerToken(account) {
  return jwt.sign(
    { sub: String(account._id), typ: 'customer', ver: account.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signCustomerRefreshToken(account) {
  return jwt.sign(
    { sub: String(account._id), typ: 'customer-refresh', ver: account.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// Issue a fresh pair. Used by every sign-in path and by the refresh endpoint.
function issueCustomerTokens(account) {
  return { token: signCustomerToken(account), refreshToken: signCustomerRefreshToken(account) };
}

async function accountFromToken(token, expectedTyp) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (decoded.typ !== expectedTyp || !decoded.sub) return null;

  const account = await CustomerAccount.findById(decoded.sub);
  if (!account || !account.isActive || account.isBlocked) return null;
  // Reject tokens minted before the last "log out everywhere".
  if (typeof decoded.ver === 'number' && decoded.ver !== (account.tokenVersion || 0)) return null;
  return account;
}

async function resolveCustomer(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return accountFromToken(token, 'customer');
}

// Verify a refresh token (from the request body) and return its account.
function accountFromRefreshToken(refreshToken) {
  return accountFromToken(refreshToken, 'customer-refresh');
}

// Hard gate: 401 unless a valid customer access token is present.
async function protectCustomer(req, res, next) {
  try {
    const account = await resolveCustomer(req);
    if (!account) {
      return res.status(401).json({ message: 'Please sign in to continue.' });
    }
    req.customer = account;
    next();
  } catch (err) {
    next(err);
  }
}

// Soft: attach req.customer if a valid token is present, otherwise continue
// as an anonymous guest.
async function attachCustomer(req, res, next) {
  try {
    req.customer = await resolveCustomer(req);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  protectCustomer,
  attachCustomer,
  signCustomerToken,
  signCustomerRefreshToken,
  issueCustomerTokens,
  accountFromRefreshToken,
};
