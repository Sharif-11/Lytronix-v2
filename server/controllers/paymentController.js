const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { getGateway } = require('../services/payments');

// GET /api/payments?status=&method=&order=&search=&page=&limit=
// `search` matches the payment's own fields (sender number, transaction ID,
// gateway reference) OR the order it belongs to (order number, customer name
// / phone) — covers "search payment by phone number, transaction ID, ...".
exports.listPayments = async (req, res) => {
  const { status, method, order, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (method) filter.method = method;
  if (order) filter.order = order;

  if (search) {
    const re = { $regex: search, $options: 'i' };
    const matchingOrders = await Order.find({
      $or: [{ orderNumber: re }, { 'customer.name': re }, { 'customer.phone': re }],
    })
      .select('_id')
      .limit(500);

    filter.$or = [
      { senderNumber: re },
      { transactionId: re },
      { gatewayReference: re },
      { order: { $in: matchingOrders.map((o) => o._id) } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('order', 'orderNumber customer.name customer.phone pricing.grandTotal pricing.due status')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Payment.countDocuments(filter),
  ]);

  res.json({ payments, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 });
};

// GET /api/payments/:id
exports.getPayment = async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate('order').populate('verifiedBy', 'name');
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  res.json(payment);
};

// Pushes a verified Payment into the order's own payment ledger so the
// existing due-amount calculation (Order.pre('validate')) picks it up, and —
// if the order was sitting in "unverified" waiting on exactly this — moves it
// on to "pending" now that a human has confirmed the payment.
async function mirrorIntoOrderLedger(payment) {
  const order = await Order.findById(payment.order);
  if (!order) return;

  const labelByMethod = {
    cod: 'Cash on Delivery',
    bkash_manual: 'bKash',
    bkash_automated: 'bKash',
    sslcommerz: 'SSLCommerz',
    other: 'Payment',
  };

  order.payments.push({
    walletName: labelByMethod[payment.method] || 'Payment',
    walletPhoneNo: payment.senderNumber || '',
    transactionId: payment.transactionId || payment.gatewayReference || '',
    amount: payment.amount,
    time: payment.verifiedAt || new Date(),
    note: `Verified ${payment.method} payment (ref: ${payment._id}).`,
  });

  if (order.status.trim().toLowerCase() === 'unverified') {
    order.status = 'pending';
    order.statusHistory.push({
      status: 'pending',
      note: 'Payment verified.',
      at: new Date(),
    });
  }

  await order.save();
}

// PATCH /api/payments/:id/verify  { transactionId?, note? }
// For a manual bKash payment (has its own transactionId on file), the admin
// must re-enter the transaction ID and it must match — a deliberate extra
// step so a payment can't be approved without the admin actually reading it
// against the customer's proof.
exports.verifyPayment = async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  if (payment.status === 'verified') {
    return res.status(409).json({ message: 'This payment is already verified.' });
  }

  if (payment.transactionId) {
    const entered = String(req.body.transactionId || '').trim();
    if (!entered) {
      return res.status(400).json({ message: 'Enter the transaction ID to confirm this payment.' });
    }
    if (entered.toLowerCase() !== payment.transactionId.trim().toLowerCase()) {
      return res.status(400).json({ message: "That doesn't match this payment's transaction ID. Please check and try again." });
    }
  }

  payment.status = 'verified';
  payment.verifiedBy = req.user._id;
  payment.verifiedAt = new Date();
  if (req.body.note) payment.note = req.body.note;
  await payment.save();

  await mirrorIntoOrderLedger(payment);

  res.json(payment);
};

// PATCH /api/payments/:id/reject  { reason }
exports.rejectPayment = async (req, res) => {
  const { reason } = req.body;
  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });

  payment.status = 'failed';
  payment.rejectionReason = reason || 'Rejected by admin';
  payment.verifiedBy = req.user._id;
  payment.verifiedAt = new Date();
  await payment.save();

  res.json(payment);
};

// POST /api/orders/:id/payments/bkash/initiate  (public)
// Kicks off the automated bKash checkout flow for an existing order.
exports.initiateBkash = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  const gateway = getGateway('bkash');
  if (!gateway) return res.status(400).json({ message: 'bKash gateway is not registered on this server.' });

  const payment = await Payment.findOneAndUpdate(
    { order: order._id, method: 'bkash_automated' },
    { $setOnInsert: { amount: order.pricing.grandTotal, status: 'pending' } },
    { upsert: true, new: true }
  );

  // Will currently throw "not configured" until real BKASH_* credentials
  // are added — that's surfaced to the customer as a normal 400 so the
  // storefront can offer COD / manual bKash as a fallback.
  const result = await gateway.initiate({ order, payment });
  res.json(result);
};

// POST /api/orders/:id/payments/bkash/callback  (public — bKash redirects/calls this)
exports.bkashCallback = async (req, res) => {
  const gateway = getGateway('bkash');
  if (!gateway) return res.status(400).json({ message: 'bKash gateway is not registered on this server.' });

  const result = await gateway.verify(req.body);
  res.json(result);
};
