const SmsLog = require('../models/SmsLog');
const sms = require('../services/sms');

// GET /api/sms-logs?order=<id>&search=&status=&purpose=&page=&limit=
exports.listSmsLogs = async (req, res) => {
  const { order, search, status, purpose, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (order) filter.order = order;
  if (status) filter.status = status;
  if (purpose) filter.purpose = purpose;
  if (search) {
    const re = { $regex: search, $options: 'i' };
    filter.$or = [{ to: re }, { message: re }, { error: re }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [logs, total] = await Promise.all([
    SmsLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    SmsLog.countDocuments(filter),
  ]);

  res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 });
};

// GET /api/sms-logs/balance — remaining BulkSMSBD credit (for the Marketing page).
// `mocked: true` means SMS is being simulated (dev mode) — the balance is a
// stand-in and no real messages go out. The admin UI badges this.
exports.getSmsBalance = async (req, res) => {
  const mocked = sms.isMocked();
  if (!mocked && !sms.isConfigured()) {
    return res.status(400).json({ message: 'SMS gateway is not configured.' });
  }
  const result = await sms.getBalance();
  if (result.balance === null) {
    return res.status(502).json({ message: result.error || 'Could not fetch SMS balance.' });
  }
  res.json({ balance: result.balance, mocked });
};
