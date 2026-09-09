const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { getGateway } = require('../services/payments');
const logger = require('../services/logger');

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
  if (!gateway || !gateway.isEnabled || !gateway.isEnabled()) {
    return res.status(400).json({ message: 'bKash automated checkout is not available right now.' });
  }

  let payment = await Payment.findOne({ order: order._id, method: 'bkash_automated' });
  if (payment && payment.status === 'verified') {
    return res.status(409).json({ message: 'This order has already been paid.' });
  }
  if (['cancelled', 'refunded', 'returned', 'completed'].includes(order.status)) {
    return res.status(409).json({ message: 'This order can no longer be paid online.' });
  }

  // Charge only what is actually outstanding — grandTotal minus any advance
  // already paid and any payments already recorded on the order ledger — so a
  // customer can never over-pay an order via the automated flow.
  const outstanding =
    order.pricing && order.pricing.due != null
      ? Math.round(order.pricing.due * 100) / 100
      : order.pricing.grandTotal;
  if (!(outstanding > 0)) {
    return res.status(409).json({ message: 'This order is already fully paid.' });
  }

  if (!payment) {
    payment = await Payment.create({
      order: order._id,
      method: 'bkash_automated',
      amount: outstanding,
      status: 'pending',
    });
  } else {
    // Retry: wipe the previous failed / abandoned attempt so a fresh bKash
    // payment can be created against this same order.
    payment.status = 'pending';
    payment.rejectionReason = '';
    payment.transactionId = '';
    payment.amount = outstanding;
    await payment.save();
  }

  // bKash redirects the customer's BROWSER back to this URL — it only needs
  // to be reachable from the shopper's device. Set API_BASE_URL for LAN /
  // production; otherwise derive it from the incoming request.
  const apiBase = (process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const callbackURL = `${apiBase}/api/orders/${order._id}/payments/bkash/callback`;

  const result = await gateway.initiate({ order, payment, callbackURL });
  res.json(result); // { redirectURL, paymentID }
};

// GET /api/orders/:id/payments/bkash/callback?paymentID=&status=
// bKash sends the shopper's browser here after payment. We execute the
// payment, update the Payment/Order, then redirect back to the storefront.
exports.bkashCallback = async (req, res) => {
  const clientBase = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const order = await Order.findById(req.params.id);
  const dest = (result) => {
    const path = order?.trackingId ? `/track/${order.trackingId}` : '/shop';
    return `${clientBase}${path}?bkash=${result}`;
  };

  const gateway = getGateway('bkash');
  const payment = order && (await Payment.findOne({ order: order._id, method: 'bkash_automated' }));
  if (!order || !gateway || !payment) return res.redirect(dest('error'));

  const { paymentID, status } = req.query;

  // Idempotency: bKash (or a browser refresh / back-forward) can deliver this
  // callback more than once. If we've already settled this payment, just bounce
  // back to the result page without executing or ledgering it again.
  if (payment.status === 'verified') {
    return res.redirect(dest('success'));
  }

  if (status !== 'success') {
    payment.status = 'failed';
    payment.rejectionReason = `bKash: ${status || 'cancelled'}`;
    await payment.save().catch(() => {});
    logger.info('bkash: callback non-success', { orderNumber: order.orderNumber, status });
    return res.redirect(dest(status === 'failure' ? 'failed' : 'cancelled'));
  }

  try {
    const result = await gateway.execute(paymentID);
    if (result.ok) {
      // Trust bKash's reported amount for the ledger entry; fall back to what
      // we asked for if it's missing.
      const paidAmount = Number(result.amount) > 0 ? Number(result.amount) : payment.amount;
      payment.status = 'verified';
      payment.transactionId = result.trxID || paymentID;
      payment.amount = paidAmount;
      payment.verifiedAt = new Date();
      await payment.save();
      // Mirror into the order's own payment ledger so pricing.due drops by the
      // amount received and the order moves unverified -> pending.
      await mirrorIntoOrderLedger(payment);
      logger.info('bkash: payment verified', {
        orderNumber: order.orderNumber,
        trxID: result.trxID,
        amount: paidAmount,
      });
      return res.redirect(dest('success'));
    }
    payment.status = 'failed';
    payment.rejectionReason = `bKash execute: ${result.raw?.statusMessage || 'not completed'}`;
    await payment.save().catch(() => {});
    logger.warn('bkash: execute not completed', { orderNumber: order.orderNumber, raw: result.raw });
    return res.redirect(dest('failed'));
  } catch (err) {
    logger.error('bkash: callback execute error', { orderId: String(order._id), error: err.message });
    return res.redirect(dest('error'));
  }
};
