const Order = require('../models/Order');
const steadfast = require('../services/steadfast');
const notificationCenter = require('../services/notificationCenter');
const logger = require('../services/logger');

const notConfigured = (res) =>
  res.status(400).json({ message: 'Steadfast API credentials are not configured on the server.' });

// ---- Fraud check ---------------------------------------------------------
// Steadfast rate-limits this per merchant (about four checks per parcel booked
// on the busiest day of the week, plus ten), so results are cached for a while:
// re-typing the same number, or reopening an order, must not spend the allowance.
const FRAUD_TTL_MS = 10 * 60 * 1000;
const fraudCache = new Map();

// GET /api/couriers/steadfast/fraud-check/:phone
exports.fraudCheck = async (req, res) => {
  if (!steadfast.isConfigured()) return notConfigured(res);

  const phone = String(req.params.phone || '').replace(/\D/g, '');
  if (!/^01\d{9}$/.test(phone)) return res.status(400).json({ message: 'Enter an 11-digit phone number starting with 01.' });

  const hit = fraudCache.get(phone);
  if (hit && Date.now() - hit.at < FRAUD_TTL_MS) return res.json({ ...hit.data, cached: true });

  try {
    const d = await steadfast.fraudScore(phone);
    const data = {
      phone,
      score: d.score ?? null, // null = nobody has history for this number ("we don't know"), not a low score
      level: d.level || 'new',
      reasons: Array.isArray(d.reasons) ? d.reasons : [],
      doubtful_reports: Boolean(d.doubtful_reports),
      total_reports: Number(d.total_reports) || 0,
    };
    if (fraudCache.size > 500) fraudCache.clear();
    fraudCache.set(phone, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    if (err.statusCode === 429) {
      return res.status(429).json({ message: 'Fraud-check limit reached for now. Try again later.' });
    }
    res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }
};

// ---- Payouts / returns (dashboard) --------------------------------------

// GET /api/couriers/steadfast/payments?page=
exports.listPayouts = async (req, res) => {
  if (!steadfast.isConfigured()) return notConfigured(res);
  try {
    const d = await steadfast.getPayments(Math.max(1, parseInt(req.query.page, 10) || 1));
    res.json({ payments: Array.isArray(d.payments) ? d.payments : d.payments?.data || [] });
  } catch (err) {
    res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }
};

// GET /api/couriers/steadfast/returns
exports.listReturns = async (req, res) => {
  if (!steadfast.isConfigured()) return notConfigured(res);
  try {
    const d = await steadfast.getReturnRequests();
    // Laravel paginator ({ data: [...] }) or a bare array — accept both.
    const list = Array.isArray(d) ? d : d.data || d.return_requests || [];
    res.json({ returns: list });
  } catch (err) {
    res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }
};

// POST /api/orders/:id/steadfast/return  { reason }
// Asks Steadfast to bring a booked parcel back before it is delivered.
exports.requestReturn = async (req, res) => {
  if (!steadfast.isConfigured()) return notConfigured(res);
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (!order.courier?.consignmentId) {
    return res.status(400).json({ message: 'This order has not been booked with Steadfast yet.' });
  }

  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  let result;
  try {
    result = await steadfast.createReturnRequest({
      consignment_id: order.courier.consignmentId,
      ...(reason ? { reason } : {}),
    });
  } catch (err) {
    logger.error('courier: return request failed', { orderNumber: order.orderNumber, error: err.message });
    return res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }

  order.courierEvents.push({ message: `Return requested from Steadfast${reason ? `: ${reason}` : '.'}`, at: new Date() });
  await order.save();

  notificationCenter.push({
    type: 'system',
    severity: 'info',
    title: `Return requested · ${order.orderNumber}`,
    body: reason || 'Steadfast will bring the parcel back.',
    order: order._id,
    link: `/orders/${order._id}`,
  });
  res.status(201).json({ request: result, order });
};
