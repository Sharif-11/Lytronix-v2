const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the Bearer token, loads the user + their role, and attaches it
// as req.user. Any route behind this middleware is admin-only.
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('role');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account not found or disabled.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
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
