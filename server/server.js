require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./services/logger');
const contactRoutes = require('./routes/contactRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messengerRoutes = require('./routes/messengerRoutes');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const courierRoutes = require('./routes/courierRoutes');
const customerRoutes = require('./routes/customerRoutes');
const smsRoutes = require('./routes/smsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const pushRoutes = require('./routes/pushRoutes');

// Registers the bKash gateway (stubbed until real credentials are added —
// see services/payments/bkash.js). New gateways (SSLCommerz, etc.) register
// the same way, without touching order/payment controllers.
require('./services/payments').registerGateway('bkash', require('./services/payments/bkash'));
const Order = require('./models/Order');
const { getPoliceStations } = require('./controllers/metaController');
const asyncHandler = require('./middleware/asyncHandler');

connectDB();

const app = express();

// Behind nginx / Cloudflare in production so req.ip is the real client (used
// for analytics view de-duplication and HTTP logs). TRUST_PROXY overrides:
// a number of proxy hops, "true", "false", or a comma-list of trusted IPs.
const trustProxy = process.env.TRUST_PROXY;
app.set(
  'trust proxy',
  trustProxy === undefined
    ? process.env.NODE_ENV === 'production'
      ? 1
      : false
    : /^\d+$/.test(trustProxy)
    ? Number(trustProxy)
    : trustProxy === 'true'
    ? true
    : trustProxy === 'false'
    ? false
    : trustProxy
);

// Allow both frontends (storefront + admin) to call this one API.
// Set ALLOWED_ORIGINS in .env as a comma-separated list for production.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
// `verify` stashes the exact raw bytes on req.rawBody — needed by the
// Messenger webhook to check Facebook's X-Hub-Signature-256, which is
// computed over the raw body and won't match a re-serialized req.body.
// Negligible cost for every other route, which never reads it.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
// HTTP access logs flow through the same winston logger as the rest of the
// app (server/services/logger.js) so `logs/combined.log` has everything in
// one place, while still printing a readable line to the console in dev.
app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/meta/statuses', (req, res) => res.json(Order.SUGGESTED_STATUSES));
app.get('/api/meta/police-stations', asyncHandler(getPoliceStations));
// Merchant/label metadata shown on the printed courier label.
app.get('/api/meta/steadfast', (req, res) =>
  res.json({
    merchantId: process.env.STEADFAST_MERCHANT_ID || '',
    trackingUrlTemplate: process.env.STEADFAST_TRACKING_URL_TEMPLATE || '',
  })
);
// Which online payment methods the storefront checkout should offer.
app.get('/api/meta/payments', asyncHandler(async (req, res) => {
  const bkash = require('./services/payments').getGateway('bkash');
  const methods = require('./services/paymentSettings').get();
  // Only the ACTIVE number of each wallet (bKash / Nagad / Rocket) is exposed.
  let wallets = { bkash: null, nagad: null, rocket: null };
  let bkashWalletOn = false; // needs an enabled wallet AND an active number — no fallback number
  try {
    const walletDoc = await require('./models/WalletSettings').load();
    wallets = walletDoc.toPublic();
    bkashWalletOn = Boolean(wallets.bkash);
  } catch {
    /* no wallet data: manual bKash stays hidden */
  }
  // Manual "send money" bKash needs an active bKash number; there is no fallback number.
  const shownMethods = { ...methods, bkash_manual: methods.bkash_manual && bkashWalletOn };
  res.json({
    wallets,
    bkashAutomated: Boolean(bkash && bkash.isEnabled && bkash.isEnabled() && methods.bkash_automated),
    // Which methods a super admin has switched on (bank transfer also needs an active bank account).
    methods: shownMethods,
  });
}));

// Public: the bank account customers transfer to (storefront checkout shows it
// only when bank transfer is set up).
app.get(
  '/api/meta/bank',
  asyncHandler(async (req, res) => {
    const doc = await require('./models/BankSettings').load();
    const pub = doc.toPublic();
    if (!require('./services/paymentSettings').get().bank_transfer) {
      pub.configured = false;
      pub.accounts = [];
    }
    res.json(pub);
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/sms-listener', require('./routes/smsListenerRoutes'));
app.use('/api/account', accountRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);

app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/messenger', messengerRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sms-logs', smsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/push', pushRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

// Periodically trims old chat messages + their Cloudinary media (keeps each
// thread + its first message).
require('./services/chatCleanup').scheduleChatCleanup();
// Periodically removes expired/unused pairing codes and long-revoked SMS
// listener devices — see SMS_DEVICE_RETENTION_DAYS.
require('./services/smsListenerCleanup').scheduleSmsListenerCleanup();
require('./services/paymentSettings').startRefreshing();
require('./services/walletCredentials').startRefreshing();
require('./services/payoutSync').startSchedule();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API server running on port ${PORT}`));
