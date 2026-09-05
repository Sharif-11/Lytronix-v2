const Notification = require('../models/Notification');

// GET /api/notifications?limit=30&before=<iso>
exports.listNotifications = async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const filter = {};
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ readBy: { $ne: req.user._id } }),
  ]);

  res.json({
    notifications: notifications.map((n) => ({
      ...n,
      read: (n.readBy || []).some((id) => String(id) === String(req.user._id)),
    })),
    unreadCount,
  });
};

// POST /api/notifications/read   { ids: [] }
exports.markRead = async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length) {
    await Notification.updateMany(
      { _id: { $in: ids } },
      { $addToSet: { readBy: req.user._id } }
    );
  }
  const unreadCount = await Notification.countDocuments({ readBy: { $ne: req.user._id } });
  res.json({ ok: true, unreadCount });
};

// POST /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  await Notification.updateMany(
    { readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json({ ok: true, unreadCount: 0 });
};
