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

// ---- Pickup requests -----------------------------------------------------
const PickupRequest = require('../models/PickupRequest');
const CourierSettings = require('../models/CourierSettings');

const int = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

// GET /api/couriers/steadfast/pickup
// Saved defaults, recent requests, and a suggested quantity: parcels booked but
// not yet picked up (still 'in_review' or 'pending' on Steadfast's side).
exports.getPickup = async (req, res) => {
  const [settings, recent, waiting] = await Promise.all([
    CourierSettings.load(),
    PickupRequest.find().sort({ createdAt: -1 }).limit(10).lean(),
    Order.countDocuments({
      'courier.consignmentId': { $exists: true, $ne: null },
      'courier.status': { $in: ['in_review', 'pending'] },
    }),
  ]);
  res.json({ defaults: settings.pickup, recent, suggestedQty: waiting });
};

// POST /api/couriers/steadfast/pickup-requests
// { addressId, policeStationId, address, contactNumber, note?, estimatedQty?, saveDefaults?,
//   districtName?, policeStationName? }
exports.createPickup = async (req, res) => {
  if (!steadfast.isConfigured()) return notConfigured(res);
  const b = req.body || {};

  const addressId = int(b.addressId);
  const policeStationId = int(b.policeStationId);
  const address = String(b.address || '').trim();
  const contactNumber = String(b.contactNumber || '').replace(/\D/g, '');
  const note = String(b.note || '').trim();
  const estimatedQty = b.estimatedQty === '' || b.estimatedQty == null ? null : int(b.estimatedQty);

  if (!addressId) return res.status(400).json({ message: 'Enter your Steadfast pickup address ID (from the Pickup Addresses page in the Steadfast portal).' });
  if (!policeStationId) return res.status(400).json({ message: 'Choose the thana the pickup address is in.' });
  if (!address) return res.status(400).json({ message: 'Enter the pickup address.' });
  if (address.length > 255) return res.status(400).json({ message: 'The pickup address must be 255 characters or fewer.' });
  if (!/^01[3-9]\d{8}$/.test(contactNumber)) {
    return res.status(400).json({ message: 'The contact number must be 11 digits starting with 013 to 019.' });
  }
  if (note.length > 500) return res.status(400).json({ message: 'The note must be 500 characters or fewer.' });
  if (b.estimatedQty && estimatedQty === null) return res.status(400).json({ message: 'Estimated quantity must be a whole number.' });

  let result;
  try {
    result = await steadfast.createPickupRequest({
      address_id: addressId,
      police_station_id: policeStationId,
      address,
      contact_number: contactNumber,
      ...(note ? { note } : {}),
      ...(estimatedQty ? { estim_qty: estimatedQty } : {}),
    });
  } catch (err) {
    logger.error('courier: pickup request failed', { error: err.message });
    if (err.statusCode === 409) {
      return res.status(409).json({ message: 'A pickup request for this address is already pending — a rider will come, no need to ask again.' });
    }
    return res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }

  const saved = await PickupRequest.create({
    addressId,
    policeStationId,
    address,
    contactNumber,
    note,
    estimatedQty,
    steadfastId: result?.data?.id ?? null,
    response: result,
    createdBy: req.user?._id || null,
  });

  if (b.saveDefaults) {
    const settings = await CourierSettings.load();
    settings.pickup = {
      addressId,
      policeStationId,
      districtName: String(b.districtName || '').slice(0, 80),
      policeStationName: String(b.policeStationName || '').slice(0, 80),
      address,
      contactNumber,
    };
    await settings.save();
  }

  notificationCenter.push({
    type: 'system',
    severity: 'success',
    title: 'Pickup requested from Steadfast',
    body: `${estimatedQty ? `~${estimatedQty} parcel(s) · ` : ''}${address}`,
    link: '/',
  });
  res.status(201).json({ request: saved });
};

// ---- COD settlement ------------------------------------------------------
const SteadfastPayout = require('../models/SteadfastPayout');
const { syncPayouts } = require('../services/payoutSync');

const NO_PAYOUT = [{ 'courier.payoutId': '' }, { 'courier.payoutId': null }, { 'courier.payoutId': { $exists: false } }];

async function settlementSnapshot() {
  const awaitingFilter = {
    'courier.consignmentId': { $exists: true, $ne: null },
    'courier.status': { $in: ['delivered', 'partial_delivered'] },
    'courier.codAmount': { $gt: 0 },
    $or: NO_PAYOUT,
  };
  const [awaitingAgg, awaitingList, settledAgg, received] = await Promise.all([
    Order.aggregate([{ $match: awaitingFilter }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$courier.codAmount' } } }]),
    Order.find(awaitingFilter).sort({ updatedAt: 1 }).limit(8).select('orderNumber customer.name courier.codAmount updatedAt').lean(),
    Order.aggregate([
      { $match: { 'courier.payoutId': { $exists: true, $ne: '' } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$courier.payoutAmount' } } },
    ]),
    SteadfastPayout.aggregate([
      { $match: { statusLabel: /^paid$/i } },
      { $group: { _id: null, payouts: { $sum: 1 }, net: { $sum: '$total' }, lastPaidAt: { $max: '$paidAt' }, lastSyncAt: { $max: '$updatedAt' } } },
    ]),
  ]);
  const anySync = await SteadfastPayout.findOne().sort({ updatedAt: -1 }).select('updatedAt').lean();
  return {
    awaiting: { count: awaitingAgg[0]?.count || 0, amount: awaitingAgg[0]?.amount || 0, orders: awaitingList },
    settled: { count: settledAgg[0]?.count || 0, amount: settledAgg[0]?.amount || 0 },
    received: { payouts: received[0]?.payouts || 0, net: received[0]?.net || 0, lastPaidAt: received[0]?.lastPaidAt || null },
    lastSyncAt: anySync?.updatedAt || null,
  };
}
exports.settlementSnapshot = settlementSnapshot;

// GET /api/couriers/steadfast/settlement
exports.getSettlement = async (req, res) => {
  res.json(await settlementSnapshot());
};

// POST /api/couriers/steadfast/payouts/sync
// Looks for new payouts right now and marks the orders they settle.
exports.syncPayoutsNow = async (req, res) => {
  if (!steadfast.isConfigured()) return notConfigured(res);
  try {
    const summary = await syncPayouts();
    res.json({ summary, ...(await settlementSnapshot()) });
  } catch (err) {
    logger.error('courier: payout sync failed', { error: err.message });
    res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }
};
