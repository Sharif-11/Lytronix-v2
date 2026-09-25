// bKash Tokenized Checkout (v1.2.0-beta).
//
// Flow:
//   1. token/grant        -> id_token (cached ~55 min, per account)
//   2. checkout/create    -> { paymentID, bkashURL }  (redirect the customer to bkashURL)
//   3. customer pays on bKash's page, bKash redirects the browser back to
//      our callbackURL with ?paymentID=&status=success|failure|cancel
//   4. checkout/execute   -> { transactionStatus: 'Completed', trxID }
//
// The merchant account that RECEIVES the money is whichever bKash account the
// admin has chosen for automated payments (Admin → Payment settings → Mobile
// wallet numbers). bKash pays into the merchant account its API credentials
// belong to, so the credentials are saved per account (encrypted) and looked up
// through services/walletCredentials.js. There is no .env fallback.

const axios = require('axios');
const logger = require('../logger');
const walletCredentials = require('../walletCredentials');

const SANDBOX_URL = 'https://tokenized.sandbox.bka.sh/v1.2.0-beta';
const LIVE_URL = 'https://tokenized.pay.bka.sh/v1.2.0-beta';
const base = (acct) => (acct.sandbox ? SANDBOX_URL : LIVE_URL);

const tokenCache = new Map(); // accountId -> { id, exp }

// Offered only while an account with credentials is selected for automated payments.
function isConfigured() {
  return Boolean(walletCredentials.active('bkash'));
}
const isEnabled = isConfigured;

function fail(message, statusCode = 502, extra) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (extra) err.bkash = extra;
  return err;
}

// accountId omitted -> the account currently selected for automated payments.
function account(accountId) {
  const acct = accountId ? walletCredentials.get(accountId) : walletCredentials.active('bkash');
  if (!acct) throw fail('No bKash account is set up to receive automated payments.', 400);
  return acct;
}

async function getToken(acct) {
  const cached = tokenCache.get(acct.id);
  if (cached && Date.now() < cached.exp) return cached.id;
  const c = acct.creds;
  let data;
  try {
    ({ data } = await axios.post(
      `${base(acct)}/tokenized/checkout/token/grant`,
      { app_key: c.appKey, app_secret: c.appSecret },
      {
        timeout: 20000,
        headers: {
          username: c.username,
          password: c.password,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    ));
  } catch (err) {
    throw fail(`bKash token grant request failed: ${err.response?.data?.statusMessage || err.message}`);
  }
  if (!data || !data.id_token) {
    throw fail(`bKash token grant failed: ${data?.statusMessage || 'no token returned'}`);
  }
  tokenCache.set(acct.id, { id: data.id_token, exp: Date.now() + (Number(data.expires_in || 3600) - 120) * 1000 });
  return data.id_token;
}

function authHeaders(acct, token) {
  return {
    Authorization: token,
    'X-APP-Key': acct.creds.appKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// { order, payment, callbackURL } -> { redirectURL, paymentID }
async function initiate({ order, payment, callbackURL }) {
  if (!isEnabled()) throw fail('bKash automated checkout is not set up on this server.', 400);

  const acct = account();
  const token = await getToken(acct);
  // BKASH_PAYER_REFERENCE (dev/sandbox only) pre-fills the wallet number on the
  // hosted page; in production it's unset so the shopper's own phone is used.
  const payerReference =
    String(process.env.BKASH_PAYER_REFERENCE || '').replace(/\D/g, '') ||
    String(order.customer?.phone || order.orderNumber).replace(/\D/g, '').slice(0, 20) ||
    order.orderNumber;
  const body = {
    mode: '0011',
    payerReference,
    callbackURL,
    amount: String(Math.round((payment.amount + Number.EPSILON) * 100) / 100),
    currency: 'BDT',
    intent: 'sale',
    merchantInvoiceNumber: order.orderNumber,
  };

  let data;
  try {
    ({ data } = await axios.post(`${base(acct)}/tokenized/checkout/create`, body, {
      headers: authHeaders(acct, token),
      timeout: 25000,
    }));
  } catch (err) {
    throw fail(`bKash create request failed: ${err.response?.data?.statusMessage || err.message}`);
  }
  if (data.statusCode !== '0000' || !data.bkashURL || !data.paymentID) {
    throw fail(`bKash create failed: ${data.statusMessage || data.statusCode || 'unknown error'}`, 502, data);
  }

  payment.transactionId = data.paymentID; // correlate the callback back to this Payment
  payment.gatewayAccount = acct.id; // the callback must finish on THIS account's credentials
  payment.status = 'pending_verification';
  await payment.save();

  logger.info('bkash: payment created', { orderNumber: order.orderNumber, paymentID: data.paymentID, account: acct.number });
  return { redirectURL: data.bkashURL, paymentID: data.paymentID };
}

// paymentID -> { ok, trxID, amount, raw }
// accountId = the account that created the payment (Payment.gatewayAccount).
async function execute(paymentID, accountId) {
  const acct = account(accountId);
  const token = await getToken(acct);
  let data;
  try {
    ({ data } = await axios.post(
      `${base(acct)}/tokenized/checkout/execute`,
      { paymentID },
      { headers: authHeaders(acct, token), timeout: 30000 }
    ));
  } catch (err) {
    // A failed execute (e.g. already executed / expired) still returns a body.
    data = err.response?.data || { statusMessage: err.message };
  }
  const ok = data.statusCode === '0000' && data.transactionStatus === 'Completed';
  return { ok, trxID: data.trxID || '', amount: data.amount, raw: data };
}

// Optional: query current status without executing.
async function queryStatus(paymentID, accountId) {
  const acct = account(accountId);
  const token = await getToken(acct);
  const { data } = await axios.post(
    `${base(acct)}/tokenized/checkout/payment/status`,
    { paymentID },
    { headers: authHeaders(acct, token), timeout: 20000 }
  );
  return data;
}

// callback payload { paymentID, status } -> execute result
async function verify(payload = {}, accountId) {
  if (!payload.paymentID) throw fail('Missing paymentID in bKash callback.', 400);
  return execute(payload.paymentID, accountId);
}

module.exports = { isConfigured, isEnabled, initiate, execute, verify, queryStatus };
