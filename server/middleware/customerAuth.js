const jwt = require('jsonwebtoken');
const CustomerAccount = require('../models/CustomerAccount');

// Storefront customer tokens are distinguished from admin tokens by a `typ`
// claim, so an admin JWT can never be replayed against customer routes and
// vice-versa.
function signCustomerToken(account) {
  return jwt.sign({ sub: String(account._id), typ: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_CUSTOMER_EXPIRES_IN || '30d',
  });
}

async function resolveCustomer(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (decoded.typ !== 'customer' || !decoded.sub) return null;

  const account = await CustomerAccount.findById(decoded.sub);
  if (!account || !account.isActive || account.isBlocked) return null;
  return account;
}

// Hard gate: 401 unless a valid customer token is present.
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
// as an anonymous guest. Used on public routes (checkout, analytics track)
// that behave slightly differently when the caller is signed in.
async function attachCustomer(req, res, next) {
  try {
    req.customer = await resolveCustomer(req);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { protectCustomer, attachCustomer, signCustomerToken };
