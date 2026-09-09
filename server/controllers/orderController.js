const Order = require('../models/Order');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const CustomerAccount = require('../models/CustomerAccount');
const steadfast = require('../services/steadfast');
const notifications = require('../services/notifications');
const notificationCenter = require('../services/notificationCenter');
const analytics = require('../services/analytics');
const ai = require('../services/ai');
const logger = require('../services/logger');
const { mapSteadfastStatus } = require('../utils/steadfastStatusMap');
const { computeOrderAdvance } = require('../utils/paymentPolicy');
const { transactionIdTakenBy } = require('../utils/transactionId');

// Guest checkout auto-creates a storefront account (name + phone) so the
// customer can sign in and track the order later. A brand-new account also
// gets a random 6-digit password (first digit non-zero) texted to it, so no
// OTP is needed for that first sign-in. Returns the account to link to the
// order, or null on failure (checkout must not break over this).
async function ensureCheckoutAccount(reqCustomer, customer) {
  if (reqCustomer) return reqCustomer; // already signed in
  const phone = String(customer?.phone || '').trim();
  if (!/^01\d{9}$/.test(phone.replace(/\D/g, ''))) return null;

  try {
    let account = await CustomerAccount.findOne({ phone });
    if (account) {
      if (customer.name && !account.name) {
        account.name = customer.name;
        await account.save();
      }
      return account;
    }
    account = new CustomerAccount({ phone, name: customer.name || '', phoneVerified: false });
    const password = CustomerAccount.generateNumericPassword();
    await account.setPassword(password, { temp: true });
    await account.save();
    notifications
      .notifyCustomerNewAccountPassword(phone, password)
      .catch((err) => logger.error('notifyCustomerNewAccountPassword failed', { error: err.message }));
    logger.info('account: auto-created at guest checkout', { phoneLast4: phone.slice(-4) });
    return account;
  } catch (err) {
    logger.error('ensureCheckoutAccount failed', { error: err.message });
    return null;
  }
}

// Keep the admin-side Customer rolodex populated from every checkout, and —
// for a signed-in shopper — make sure the address they just used is saved to
// their account so a repeat order doesn't need it re-entered. Best-effort:
// failures here never fail the order.
async function syncCustomerRecords(order, account) {
  const c = order.customer || {};
  try {
    await Customer.findOneAndUpdate(
      { phone: c.phone },
      {
        $setOnInsert: { phone: c.phone },
        $set: {
          ...(c.name ? { name: c.name } : {}),
          ...(c.zilla ? { zilla: c.zilla } : {}),
          ...(c.thana ? { thana: c.thana } : {}),
          ...(c.address ? { address: c.address } : {}),
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error('rolodex upsert failed', { error: err.message });
  }

  // Save the checkout address to the customer's account: as the DEFAULT
  // address if they have none yet, otherwise as an extra address. Skipped
  // only when that exact address is already on file.
  if (account && (c.address || '').trim()) {
    try {
      const norm = (v) => (v || '').trim().toLowerCase();
      const addrs = account.addresses || [];
      const already = addrs.some(
        (a) =>
          norm(a.address) === norm(c.address) &&
          norm(a.policeStation) === norm(c.thana) &&
          norm(a.zilla) === norm(c.zilla)
      );

      if (!already) {
        const isFirst = addrs.length === 0;
        account.addresses.push({
          label: isFirst ? 'Home' : `Address ${addrs.length + 1}`,
          name: norm(c.name) && norm(c.name) !== norm(account.name) ? c.name : '',
          phone: norm(c.phone) && norm(c.phone) !== norm(account.phone) ? c.phone : '',
          zilla: c.zilla || '',
          policeStation: c.thana || '',
          address: c.address || '',
          isDefault: isFirst,
        });
        if (!account.name && c.name) account.name = c.name;
        await account.save();
        logger.info('account: checkout address saved', {
          phoneLast4: (account.phone || '').slice(-4),
          asDefault: isFirst,
          totalAddresses: account.addresses.length,
        });
      }
    } catch (err) {
      logger.error('account address sync failed', { error: err.message });
    }
  }
}

// Atomically decrements stock for each item that references a catalogue
// product with tracking enabled. Throws (409) if any item doesn't have
// enough stock left, so the whole order creation aborts cleanly.
async function reserveStock(items) {
  const reserved = [];
  try {
    for (const item of items) {
      if (!item.product) continue;
      const product = await Product.findById(item.product);
      if (!product || !product.trackInventory) continue;

      const updated = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
      if (!updated) {
        const err = new Error(
          `"${product.name}" only has ${product.stock} left in stock — please adjust the quantity.`
        );
        err.statusCode = 409;
        throw err;
      }
      reserved.push({ productId: item.product, quantity: item.quantity });
    }
    return reserved;
  } catch (err) {
    // Roll back whatever we already decremented so a failed order doesn't
    // permanently eat stock.
    await Promise.all(
      reserved.map((r) => Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.quantity } }).catch(() => {}))
    );
    throw err;
  }
}

// Puts stock back when an order is returned.
async function restockItems(items) {
  await Promise.all(
    (items || [])
      .filter((i) => i.product)
      .map((i) =>
        Product.findOneAndUpdate({ _id: i.product, trackInventory: true }, { $inc: { stock: i.quantity } }).catch(
          () => {}
        )
      )
  );
}

// GET /api/orders?status=&search=&page=&limit=&from=&to=&all=true
// Pass all=true to bypass pagination entirely (used by the printable logbook view).
exports.listOrders = async (req, res) => {
  const { status, search, page = 1, limit = 20, from, to, all } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { trackingId: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { 'customer.phone': { $regex: search, $options: 'i' } },
    ];
  }

  if (all === 'true') {
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    return res.json({ orders, total: orders.length, page: 1, pages: 1 });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Order.countDocuments(filter),
  ]);

  res.json({
    orders,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
  });
};

// GET /api/orders/stats  -> quick counts per status, for a dashboard header
exports.orderStats = async (req, res) => {
  const results = await Order.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const stats = {};
  results.forEach((r) => {
    stats[r._id] = r.count;
  });
  const total = await Order.countDocuments({});

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totals, todayTotals] = await Promise.all([
    Order.aggregate([
      { $group: { _id: null, revenue: { $sum: '$pricing.grandTotal' }, due: { $sum: '$pricing.due' } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$pricing.grandTotal' } } },
    ]),
  ]);

  res.json({
    total,
    byStatus: stats,
    totalRevenue: totals[0]?.revenue || 0,
    totalDue: totals[0]?.due || 0,
    today: { count: todayTotals[0]?.count || 0, revenue: todayTotals[0]?.revenue || 0 },
  });
};

// GET /api/orders/:id
exports.getOrder = async (req, res) => {
  const order = await Order.findById(req.params.id).populate('items.product', 'name price description deliveryCharge');
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
};

// POST /api/orders
exports.createOrder = async (req, res) => {
  const { customer, items, pricing, payments, status, source, createdBy, weightKg, paymentMethod, paymentDetails } = req.body;

  // This route stays public (no `protect`) so guest checkout works, so
  // req.user is never set here even when the caller is an admin — the admin
  // New Order form marks itself explicitly with createdVia:'admin' instead.
  // Everything below that needs to tell "an admin typed this in" apart from
  // "a guest/customer checked out" reads this flag, not req.user.
  const isAdminCreated = req.body.createdVia === 'admin';

  logger.info('order: request received', {
    via: isAdminCreated ? 'admin' : req.customer ? 'customer' : 'guest',
    source: source || '',
    itemCount: Array.isArray(items) ? items.length : 0,
    phoneLast4: customer?.phone ? String(customer.phone).slice(-4) : '',
  });

  if (!customer || !customer.name || !customer.phone) {
    return res.status(400).json({ message: 'Customer name and phone are required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one order item is required' });
  }

  const method = paymentMethod || 'cod';
  if (method === 'bkash_manual') {
    if (!paymentDetails?.transactionId || !paymentDetails?.senderNumber) {
      return res.status(400).json({
        message: 'For bKash payments, please include the sender number and the transaction ID from your SMS.',
      });
    }
    // A transaction id belongs to exactly one payment, app-wide.
    const takenBy = await transactionIdTakenBy(paymentDetails.transactionId);
    if (takenBy) {
      return res.status(409).json({
        message: 'এই ট্রান্সেকশন আইডি ইতিমধ্যে ব্যবহৃত হয়েছে। আপনার এসএমএস থেকে সঠিক আইডিটি দিন।',
      });
    }
  }

  // Enforce each catalogue product's payment policy (some items can't be
  // sold on pure COD — see server/models/Product.js `paymentPolicy` and
  // server/utils/paymentPolicy.js). Guest/customer checkouts only — an admin
  // placing an order manually keeps full control over pricing/payment terms
  // and can override this by design.
  let requiredAdvance = 0;
  let codRemainder = 0;
  if (!isAdminCreated) {
    const productIds = items.filter((i) => i.product).map((i) => i.product);
    const productsWithPolicy = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select('paymentPolicy')
      : [];
    const policyById = new Map(productsWithPolicy.map((p) => [String(p._id), p.paymentPolicy]));

    const lines = items.map((i) => ({
      lineTotal: Math.max(0, Math.round((i.unitPrice * i.quantity - (i.discount || 0)) * 100) / 100),
      quantity: i.quantity,
      policy: i.product ? policyById.get(String(i.product)) : null,
    }));

    ({ requiredAdvance, codRemainder } = computeOrderAdvance(lines, pricing?.deliveryCharge || 0));

    if (requiredAdvance > 0 && method !== 'bkash_manual') {
      return res.status(400).json({
        message:
          codRemainder > 0
            ? `This order requires an advance payment of ৳${requiredAdvance} via bKash before it can ship; the remaining ৳${codRemainder} is payable on delivery.`
            : `This order requires the full amount (৳${requiredAdvance}) to be paid in advance via bKash — Cash on Delivery isn't available for it.`,
      });
    }
  }

  // Throws (409) with a clear message if any item is out of stock —
  // aborts before we ever create the order.
  const reserved = await reserveStock(items);

  const finalPricing = { ...(pricing || {}) };
  if (requiredAdvance > 0) finalPricing.cashOnAmount = codRemainder;

  // The initial status is business logic, not client input — a guest/customer
  // checkout can't be trusted to set it, and every storefront flow sends its
  // own hardcoded default anyway. An admin-created order (see isAdminCreated
  // above) keeps explicit control over its starting status; everyone else
  // gets "unverified" when the payment still needs a human to check it
  // (manual bKash), otherwise "pending".
  const initialStatus = isAdminCreated
    ? status || 'pending'
    : method === 'bkash_manual' || method === 'bkash_automated'
    ? 'unverified'
    : 'pending';

  // Guest checkout → find or auto-create the customer's storefront account
  // (and text them a login password if it's brand new). Admin-created orders
  // never get an account attached this way.
  const checkoutAccount = isAdminCreated ? null : await ensureCheckoutAccount(req.customer, customer);

  let order;
  try {
    order = await Order.create({
      customer,
      items,
      pricing: finalPricing,
      payments,
      status: initialStatus,
      source,
      createdBy,
      weightKg: weightKg !== undefined ? weightKg : undefined,
      customerAccount: checkoutAccount ? checkoutAccount._id : null,
    });
  } catch (err) {
    await Promise.all(
      reserved.map((r) => Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.quantity } }).catch(() => {}))
    );
    throw err;
  }

  // Every checkout — whatever the payment method — gets one persistent
  // Payment record, so "log every payment and order request" holds even
  // for "pay on delivery" intents where no money has moved yet.
  try {
    if (method === 'cod') {
      await Payment.create({ order: order._id, method: 'cod', amount: order.pricing.grandTotal, status: 'pending' });
    } else if (method === 'bkash_manual') {
      // A product's payment policy may require only a partial advance —
      // that's the amount actually expected via bKash, not the full total
      // (the rest is collected on delivery, see pricing.cashOnAmount above).
      await Payment.create({
        order: order._id,
        method: 'bkash_manual',
        amount: requiredAdvance > 0 ? requiredAdvance : order.pricing.grandTotal,
        status: 'pending_verification',
        senderNumber: paymentDetails.senderNumber,
        transactionId: paymentDetails.transactionId,
        proofImageUrl: paymentDetails.proofImageUrl || '',
      });
    } else if (method === 'bkash_automated') {
      await Payment.create({
        order: order._id,
        method: 'bkash_automated',
        amount: order.pricing.grandTotal,
        status: 'pending',
      });
    }
  } catch (err) {
    logger.error('Failed to create Payment record for order', { orderNumber: order.orderNumber, error: err.message });
  }

  // Running order counter per catalogue product (for "most ordered").
  Promise.all(
    (order.items || [])
      .filter((i) => i.product)
      .map((i) =>
        Product.findByIdAndUpdate(i.product, { $inc: { orderCount: i.quantity } }).catch(() => {})
      )
  ).catch(() => {});

  // Analytics: one order_placed event carrying the revenue snapshot.
  analytics.record({
    type: 'order_placed',
    order: order._id,
    customer: req.customer ? req.customer._id : null,
    sessionId: req.body.sessionId || '',
    value: order.pricing.grandTotal,
  });

  // Keep the rolodex + the shopper's saved addresses current (uses the
  // signed-in or auto-created account so a repeat order skips re-entry).
  // Awaited so the address is on the account by the time the storefront
  // refetches the profile after checkout — but never fatal to the order.
  try {
    await syncCustomerRecords(order, checkoutAccount);
  } catch (err) {
    logger.error('syncCustomerRecords failed', { error: err.message });
  }

  // Admin notification bar. A storefront checkout is the "new customer
  // order" the admin wants to hear about, with a sound on the client. Orders
  // the admin creates themselves (New Order form, isAdminCreated) are
  // skipped so staff don't get pinged for their own entry.
  if (!isAdminCreated) {
    notificationCenter.push({
      type: 'order_new',
      severity: 'success',
      title: `New order ${order.orderNumber}`,
      body: `${order.customer.name} · ${order.items.length} item${
        order.items.length === 1 ? '' : 's'
      } · ৳${order.pricing.grandTotal} · ${method.toUpperCase().replace('_', ' ')}`,
      order: order._id,
      link: `/orders/${order._id}`,
      meta: { orderNumber: order.orderNumber, method },
    });
  }
  if (method === 'bkash_manual') {
    notificationCenter.push({
      type: 'payment_review',
      severity: 'warning',
      title: `bKash payment to verify · ${order.orderNumber}`,
      body: `TrxID ${paymentDetails?.transactionId || '—'} from ${paymentDetails?.senderNumber || '—'}`,
      order: order._id,
      link: '/payments',
    });
  }

  // Don't make the customer's checkout wait on an SMS round-trip — send it
  // in the background and just log if it fails.
  notifications.notifyAdminsNewOrder(order).catch((err) => {
    logger.error('notifyAdminsNewOrder failed', { orderNumber: order.orderNumber, error: err.message });
  });

  logger.info('order: created', {
    orderNumber: order.orderNumber,
    method,
    grandTotal: order.pricing.grandTotal,
  });

  res.status(201).json(order);
};

// PUT /api/orders/:id  (general edit: customer info, items, pricing, comments...)
exports.updateOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  const editableFields = ['customer', 'items', 'pricing', 'source', 'createdBy', 'courierTrackingLink', 'weightKg'];
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) order[field] = req.body[field];
  });

  await order.save();
  res.json(order);
};

// PATCH /api/orders/:id/status  { status, note, courierTrackingLink }
// A courier tracking link (existing on the order, or supplied in this same
// request) is required before an order can be moved to "shipped".
exports.updateStatus = async (req, res) => {
  const { status, note, courierTrackingLink } = req.body;
  if (!status) return res.status(400).json({ message: 'status is required' });

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  const effectiveLink = courierTrackingLink !== undefined ? courierTrackingLink : order.courierTrackingLink;
  const hasTracking = Boolean(effectiveLink) || Boolean(order.courier?.trackingCode);

  if (status.trim().toLowerCase() === 'shipped' && !hasTracking) {
    return res.status(400).json({
      message: 'Add a courier tracking link (or book this order with Steadfast) before marking it as shipped',
    });
  }

  if (courierTrackingLink !== undefined) {
    order.courierTrackingLink = courierTrackingLink;
  }

  const previousStatus = order.status;
  order.status = status;
  order.statusHistory.push({ status, note: note || '', at: new Date() });
  await order.save();

  logger.info('order: status transition', {
    orderNumber: order.orderNumber,
    from: previousStatus,
    to: status,
    by: req.user?.name || 'unknown',
  });

  if (status.trim().toLowerCase() === 'returned' && previousStatus.trim().toLowerCase() !== 'returned') {
    restockItems(order.items).catch((err) => logger.error('restockItems failed', { orderNumber: order.orderNumber, error: err.message }));
  }

  res.json(order);
};

// POST /api/orders/:id/payments  { walletName, walletPhoneNo, transactionId, amount, time, note }
exports.addPayment = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  // Transaction IDs are unique app-wide — reject one already logged anywhere.
  if (req.body.transactionId) {
    const takenBy = await transactionIdTakenBy(req.body.transactionId, { exceptOrderId: order._id });
    const dupOnThisOrder = (order.payments || []).some(
      (p) => (p.transactionId || '').trim() === String(req.body.transactionId).trim()
    );
    if (takenBy || dupOnThisOrder) {
      return res.status(409).json({
        message: 'This transaction ID is already recorded on a payment. Each payment needs a unique transaction ID.',
      });
    }
  }

  order.payments.push(req.body);

  // Logging a payment against an order that's still waiting on payment
  // verification confirms it — move it forward to "pending", the same
  // transition the Payments review queue makes when an admin verifies
  // there (see paymentController.mirrorIntoOrderLedger).
  if (order.status.trim().toLowerCase() === 'unverified') {
    order.status = 'pending';
    order.statusHistory.push({ status: 'pending', note: 'Payment received / verified.', at: new Date() });
  }

  await order.save();

  // If there's a still-pending COD/automated Payment record for this order,
  // logging the actual collection here is effectively confirming it — keep
  // the persistent Payment log in sync rather than leaving it stuck as
  // "pending" forever.
  Payment.findOneAndUpdate(
    { order: order._id, method: { $in: ['cod', 'bkash_automated'] }, status: 'pending' },
    { status: 'verified', verifiedBy: req.user?._id || null, verifiedAt: new Date() }
  ).catch((err) => logger.error('Payment sync on addPayment failed', { error: err.message }));

  res.status(201).json(order);
};

// DELETE /api/orders/:id/payments/:paymentId
exports.deletePayment = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  order.payments = order.payments.filter((p) => p._id.toString() !== req.params.paymentId);
  await order.save();

  res.json(order);
};

// DELETE /api/orders/:id
exports.deleteOrder = async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json({ message: 'Order deleted' });
};

const MAX_ORDER_MESSAGE_LEN = 640; // matches the marketing broadcast cap in customerController

// POST /api/orders/:id/message  { message }
// One-off SMS straight to this order's customer.phone — for whatever isn't
// already covered by the automatic notifications (a delivery ETA, asking
// them to confirm the address, etc). Logged against the order itself.
exports.sendOrderMessage = async (req, res) => {
  const text = String(req.body.message || '').trim();
  if (!text) return res.status(400).json({ message: 'Message text is required.' });
  if (text.length > MAX_ORDER_MESSAGE_LEN) {
    return res.status(400).json({ message: `Message is too long (max ${MAX_ORDER_MESSAGE_LEN} characters).` });
  }

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (!order.customer?.phone) {
    return res.status(400).json({ message: 'This order has no customer phone number on file.' });
  }

  const result = await notifications.notifyOrderCustomMessage(order, text);
  if (!result.success) {
    return res.status(502).json({ message: result.error || 'Could not send the message. Check the SMS logs for details.' });
  }
  res.json({ sent: true });
};

// GET /api/track/:trackingId  (public, no admin data like payments/comments exposed)
exports.trackOrder = async (req, res) => {
  const order = await Order.findOne({ trackingId: req.params.trackingId }).select(
    'orderNumber trackingId status statusHistory courierEvents courier.trackingCode courier.status courier.lastMessage items pricing.grandTotal pricing.due createdAt customer.name'
  );
  if (!order) return res.status(404).json({ message: 'Tracking ID not found' });

  // Just enough payment context for the storefront to offer a "retry bKash"
  // button when an automated payment didn't go through.
  const bkashPayment = await Payment.findOne({ order: order._id, method: 'bkash_automated' })
    .select('status')
    .lean();
  const canRetryBkash =
    Boolean(bkashPayment) &&
    bkashPayment.status !== 'verified' &&
    !['cancelled', 'completed', 'refunded', 'returned'].includes(order.status);

  res.json({ ...order.toObject(), bkashPayment: bkashPayment || null, canRetryBkash });
};

// Builds the single-string address Steadfast expects, within their 250 char limit.
function buildSteadfastAddress(customer) {
  const parts = [customer.address, customer.thana, customer.zilla].filter(Boolean);
  return parts.join(', ').slice(0, 250);
}

// Fills in the public tracking link from STEADFAST_TRACKING_URL_TEMPLATE
// (e.g. "https://steadfast.com.bd/track/{trackingCode}"), if configured.
function buildTrackingLinkFromTemplate(trackingCode) {
  const template = process.env.STEADFAST_TRACKING_URL_TEMPLATE;
  if (!template || !trackingCode) return '';
  return template.replace('{trackingCode}', trackingCode);
}

// POST /api/orders/:id/steadfast/book
// Creates a consignment with Steadfast for this order and stores the result.
exports.bookSteadfastParcel = async (req, res) => {
  if (!steadfast.isConfigured()) {
    return res.status(400).json({
      message: 'Steadfast API credentials are not configured. Add STEADFAST_API_KEY and STEADFAST_SECRET_KEY to backend/.env.',
    });
  }

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  if (order.courier?.consignmentId) {
    return res.status(409).json({
      message: `This order is already booked with Steadfast (consignment #${order.courier.consignmentId}).`,
    });
  }

  const phoneDigits = (order.customer.phone || '').replace(/\D/g, '');
  if (phoneDigits.length !== 11) {
    return res.status(400).json({
      message: `Steadfast requires an 11-digit recipient phone number. "${order.customer.phone}" doesn't match — please fix the customer's phone number first.`,
    });
  }

  const payload = {
    invoice: order.orderNumber,
    recipient_name: order.customer.name,
    recipient_phone: phoneDigits,
    recipient_address: buildSteadfastAddress(order.customer),
    cod_amount: order.pricing.due,
    note: order.customer.comments || '',
    item_description: order.items.map((i) => `${i.name} x${i.quantity}`).join(', ').slice(0, 250),
    total_lot: order.items.length,
  };

  logger.info('courier: booking attempt', { orderNumber: order.orderNumber, provider: 'steadfast' });

  let result;
  try {
    result = await steadfast.createOrder(payload);
  } catch (err) {
    logger.error('courier: booking failed', { orderNumber: order.orderNumber, error: err.message });
    return res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }

  const consignment = result.consignment;
  if (!consignment) {
    return res.status(502).json({ message: 'Steadfast did not return consignment details.' });
  }

  order.courier = {
    provider: 'steadfast',
    consignmentId: consignment.consignment_id,
    trackingCode: consignment.tracking_code,
    status: consignment.status || 'in_review',
    codAmount: Number(consignment.cod_amount) || order.pricing.due,
    deliveryCharge: order.courier?.deliveryCharge ?? null,
    lastMessage: 'Consignment created with Steadfast.',
    lastSyncedAt: new Date(),
  };

  const templatedLink = buildTrackingLinkFromTemplate(consignment.tracking_code);
  if (templatedLink && !order.courierTrackingLink) {
    order.courierTrackingLink = templatedLink;
  }

  order.courierEvents.push({ message: 'Booked with Steadfast Courier.', at: new Date() });

  // Booking the parcel is what moves an order out of "pending"/"unverified"
  // into "processing" — the next status changes then come from Steadfast's
  // own webhook/sync (see steadfastStatusMap.js).
  if (order.status !== 'processing') {
    order.status = 'processing';
    order.statusHistory.push({ status: 'processing', note: 'Booked with Steadfast Courier.', at: new Date() });
  }

  await order.save();

  logger.info('courier: booked', {
    orderNumber: order.orderNumber,
    consignmentId: consignment.consignment_id,
    trackingCode: consignment.tracking_code,
  });

  // Booking already succeeded — an SMS hiccup shouldn't turn this into an
  // error response, so this is deliberately not in the try/catch above.
  try {
    await notifications.notifyCustomerConsignmentBooked(order);
  } catch (err) {
    logger.error('notifyCustomerConsignmentBooked failed', { error: err.message });
  }

  res.status(201).json(order);
};

// POST /api/orders/:id/steadfast/sync
// Pulls the latest delivery status from Steadfast and applies it to the order.
exports.syncSteadfastStatus = async (req, res) => {
  if (!steadfast.isConfigured()) {
    return res.status(400).json({ message: 'Steadfast API credentials are not configured.' });
  }

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  if (!order.courier?.consignmentId) {
    return res.status(400).json({ message: 'This order has not been booked with Steadfast yet.' });
  }

  let result;
  try {
    result = await steadfast.statusByConsignmentId(order.courier.consignmentId);
  } catch (err) {
    logger.error('courier: status sync failed', { orderNumber: order.orderNumber, error: err.message });
    return res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }

  const rawStatus = result.delivery_status;
  order.courier.status = rawStatus || order.courier.status;
  order.courier.lastMessage = `Synced: ${rawStatus || 'unknown'}`;
  order.courier.lastSyncedAt = new Date();

  const previousStatus = order.status;
  const mapped = mapSteadfastStatus(rawStatus);
  if (mapped && mapped !== order.status) {
    order.status = mapped;
    order.statusHistory.push({ status: mapped, note: `Synced from Steadfast (${rawStatus})`, at: new Date() });
  }

  await order.save();

  logger.info('courier: status synced', { orderNumber: order.orderNumber, rawStatus, status: order.status });

  if (
    order.status.trim().toLowerCase() === 'cancelled' &&
    previousStatus.trim().toLowerCase() !== 'cancelled'
  ) {
    restockItems(order.items).catch((err) => logger.error('restockItems failed', { orderNumber: order.orderNumber, error: err.message }));
  }

  if (order.status === 'delivered' && previousStatus !== 'delivered') {
    notifications.notifyCustomerDelivered(order).catch((err) => {
      logger.error('notifyCustomerDelivered failed', { orderNumber: order.orderNumber, error: err.message });
    });
  }

  res.json(order);
};

// GET /api/couriers/steadfast/balance
exports.getSteadfastBalance = async (req, res) => {
  if (!steadfast.isConfigured()) {
    return res.status(400).json({ message: 'Steadfast API credentials are not configured.' });
  }
  try {
    const result = await steadfast.getBalance();
    res.json({ balance: result.current_balance });
  } catch (err) {
    res.status(err.statusCode || 502).json({ message: `Steadfast: ${err.message}` });
  }
};

// POST /api/webhooks/steadfast  (public — Steadfast calls this directly)
// Handles both "delivery_status" and "tracking_update" notification types.
exports.steadfastWebhook = async (req, res) => {
  logger.info('courier: webhook callback received', {
    notification_type: req.body?.notification_type,
    consignment_id: req.body?.consignment_id,
    invoice: req.body?.invoice,
    status: req.body?.status,
  });

  const configuredToken = process.env.STEADFAST_WEBHOOK_TOKEN;
  if (configuredToken) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token !== configuredToken) {
      return res.status(401).json({ status: 'error', message: 'Invalid or missing webhook auth token.' });
    }
  }

  const { notification_type, consignment_id, invoice, status, tracking_message, delivery_charge, cod_amount } = req.body;

  if (!consignment_id && !invoice) {
    return res.status(400).json({ status: 'error', message: 'Missing consignment_id or invoice.' });
  }

  const order = await Order.findOne(
    consignment_id ? { 'courier.consignmentId': consignment_id } : { orderNumber: invoice }
  );

  if (!order) {
    // Steadfast still expects a 200 so it doesn't keep retrying for an order
    // that simply doesn't exist in our system (e.g. a stale/test webhook) —
    // but surface it in the notification bar so it isn't silently lost.
    notificationCenter.push({
      type: 'system',
      severity: 'warning',
      title: 'Steadfast webhook for an unknown parcel',
      body: `${notification_type || 'event'} · consignment ${consignment_id || '—'} · invoice ${invoice || '—'}`,
      meta: req.body,
    });
    return res.status(200).json({ status: 'success', message: 'No matching order found; ignored.' });
  }

  order.courier = order.courier || {};
  order.courier.provider = 'steadfast';
  order.courier.lastSyncedAt = new Date();
  if (tracking_message) order.courier.lastMessage = tracking_message;
  if (delivery_charge !== undefined) order.courier.deliveryCharge = delivery_charge;
  if (cod_amount !== undefined) order.courier.codAmount = cod_amount;

  const previousStatus = order.status;
  const rawStatus = status || '';

  if (notification_type === 'delivery_status') {
    order.courier.status = rawStatus || order.courier.status;
    // Steadfast delivery_status values: pending | delivered | partial_delivered
    // | cancelled | unknown  (mapSteadfastStatus lower-cases + maps these).
    const mapped = mapSteadfastStatus(rawStatus);
    if (mapped && mapped !== order.status) {
      order.status = mapped;
      order.statusHistory.push({
        status: mapped,
        note: tracking_message || `Steadfast: ${rawStatus}`,
        at: new Date(),
      });
    }
    // Steadfast's own tracking_message is already a clean, human sentence
    // (e.g. "Consignment status has been updated as Pending") — use it
    // verbatim so our timeline reads the same as theirs, instead of
    // prepending our own "Delivery status: X" wrapper. Only synthesize one
    // when they don't send a message at all.
    order.courierEvents.push({
      message: tracking_message || `Delivery status updated: ${rawStatus || 'unknown'}`,
      at: new Date(),
    });
  } else if (notification_type === 'tracking_update') {
    order.courierEvents.push({ message: tracking_message || 'Tracking update received.', at: new Date() });
  }

  await order.save();

  // A parcel Steadfast cancels comes back to stock, same as a manual "returned".
  if (
    order.status.trim().toLowerCase() === 'cancelled' &&
    previousStatus.trim().toLowerCase() !== 'cancelled'
  ) {
    restockItems(order.items).catch((err) => logger.error('restockItems failed', { orderNumber: order.orderNumber, error: err.message }));
  }

  // Only fire once, on the transition into "delivered" — Steadfast may
  // ping this webhook repeatedly for the same terminal status.
  if (order.status === 'delivered' && previousStatus !== 'delivered') {
    notifications.notifyCustomerDelivered(order).catch((err) => {
      logger.error('notifyCustomerDelivered failed', { orderNumber: order.orderNumber, error: err.message });
    });
  }

  // Log every webhook event to the admin notification bar.
  const isDelivery = notification_type === 'delivery_status';
  const sev =
    rawStatus.toLowerCase() === 'delivered'
      ? 'success'
      : rawStatus.toLowerCase() === 'cancelled'
      ? 'error'
      : 'info';
  notificationCenter.push({
    type: isDelivery ? 'courier_status' : 'courier_tracking',
    severity: isDelivery ? sev : 'info',
    title: isDelivery
      ? `Parcel ${order.orderNumber}: ${rawStatus || 'status update'}`
      : `Tracking · ${order.orderNumber}`,
    body: tracking_message || (isDelivery ? `Status changed to ${order.status}.` : 'Tracking update received.'),
    order: order._id,
    link: `/orders/${order._id}`,
    meta: req.body,
  });

  res.status(200).json({ status: 'success', message: 'Webhook received successfully.' });
};

// POST /api/orders/ai-extract  { text?, imageBase64?, imageMediaType?, imageUrl? }
// Admin helper: turn pasted customer text or a screenshot into a draft order
// the New Order form can prefill. The admin always reviews before saving.
exports.aiExtractOrder = async (req, res) => {
  const { text, imageBase64, imageMediaType, imageUrl } = req.body;

  let image = null;
  if (imageBase64) {
    image = { media_type: imageMediaType || 'image/jpeg', data: imageBase64 };
  } else if (imageUrl) {
    try {
      const axios = require('axios');
      const r = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
      image = {
        media_type: r.headers['content-type'] || 'image/jpeg',
        data: Buffer.from(r.data).toString('base64'),
      };
    } catch (err) {
      return res.status(400).json({ message: `Could not fetch the image URL: ${err.message}` });
    }
  }

  const draft = await ai.extractOrder({ text: text ? String(text).slice(0, 8000) : '', image });
  res.json({ draft, model: ai.MODEL });
};
