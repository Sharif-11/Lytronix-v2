const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the Bearer token, loads the user + their role, and attaches it
// as req.user. Any route behind this middleware is admin-only.
async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated. Please log in.' });
  }

  // Only a genuinely bad/expired token is an auth failure (401). A database
  // or other infrastructure error below must NOT be reported as 401 — the
  // admin client treats 401 as "session dead" and logs the user out.
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
  }

  try {
    const user = await User.findById(decoded.id).populate('role');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account not found or disabled.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(503).json({ message: 'Could not verify your session right now. Please retry.' });
  }
}

// Usage: authorize('orders:manage') or authorize('orders:manage', 'orders:view')
// (any one of the listed permissions is sufficient). Superadmin role bypasses this.
function authorize(...permissions) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(403).json({ message: 'No role assigned to this account.' });
    }
    if (role.isSuperAdmin) return next();

    const hasPermission = permissions.some((p) => role.permissions.includes(p));
    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to do this.' });
    }
    next();
  };
}

module.exports = { protect, authorize };
