// bKash Tokenized Checkout (v1.2.0-beta).
//
// Flow:
//   1. token/grant        -> id_token (cached ~55 min)
//   2. checkout/create    -> { paymentID, bkashURL }  (redirect the customer to bkashURL)
//   3. customer pays on bKash's page, bKash redirects the browser back to
//      our callbackURL with ?paymentID=&status=success|failure|cancel
//   4. checkout/execute   -> { transactionStatus: 'Completed', trxID }
//
// DEV/TEST ONLY unless deliberately enabled: `isEnabled()` also requires
// BKASH_AUTO_ENABLED=true, which must NOT be set in production until real
// live merchant credentials + an https callback are in place.

const axios = require('axios');
const logger = require('../logger');

const base = () =>
  (process.env.BKASH_BASE_URL || 'https://tokenized.sandbox.bka.sh/v1.2.0-beta').replace(/\/$/, '');

let tokenCache = { id: null, exp: 0 };

function isConfigured() {
  return Boolean(
    process.env.BKASH_APP_KEY &&
      process.env.BKASH_APP_SECRET &&
      process.env.BKASH_USERNAME &&
      process.env.BKASH_PASSWORD
  );
}

// The gateway is only offered when it is both configured AND explicitly
// switched on. Keep BKASH_AUTO_ENABLED unset (or false) in production.
function isEnabled() {
  return isConfigured() && String(process.env.BKASH_AUTO_ENABLED || '').toLowerCase() === 'true';
}

function fail(message, statusCode = 502, extra) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (extra) err.bkash = extra;
  return err;
}

async function getToken() {
  if (tokenCache.id && Date.now() < tokenCache.exp) return tokenCache.id;
  let data;
  try {
    ({ data } = await axios.post(
      `${base()}/tokenized/checkout/token/grant`,
      { app_key: process.env.BKASH_APP_KEY, app_secret: process.env.BKASH_APP_SECRET },
      {
        timeout: 20000,
        headers: {
          username: process.env.BKASH_USERNAME,
          password: process.env.BKASH_PASSWORD,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    ));
  } catch (err) {
    throw fail(`bKash token grant request failed: ${err.response?.data?.statusMessage || err.message}`);
  }
  if (!data || !data.id_token) {
    throw fail(`bKash token grant failed: ${data?.statusMessage || JSON.stringify(data)}`);
  }
  tokenCache = { id: data.id_token, exp: Date.now() + (Number(data.expires_in || 3600) - 120) * 1000 };
  return tokenCache.id;
}

function authHeaders(token) {
  return {
    Authorization: token,
    'X-APP-Key': process.env.BKASH_APP_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// { order, payment, callbackURL } -> { redirectURL, paymentID }
async function initiate({ order, payment, callbackURL }) {
  if (!isEnabled()) throw fail('bKash automated checkout is not enabled on this server.', 400);

  const token = await getToken();
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
    ({ data } = await axios.post(`${base()}/tokenized/checkout/create`, body, {
      headers: authHeaders(token),
      timeout: 25000,
    }));
  } catch (err) {
    throw fail(`bKash create request failed: ${err.response?.data?.statusMessage || err.message}`);
  }
  if (data.statusCode !== '0000' || !data.bkashURL || !data.paymentID) {
    throw fail(`bKash create failed: ${data.statusMessage || data.statusCode || 'unknown error'}`, 502, data);
  }

  payment.transactionId = data.paymentID; // correlate the callback back to this Payment
  payment.status = 'pending_verification';
  await payment.save();

  logger.info('bkash: payment created', { orderNumber: order.orderNumber, paymentID: data.paymentID });
  return { redirectURL: data.bkashURL, paymentID: data.paymentID };
}

// paymentID -> { ok, trxID, amount, raw }
async function execute(paymentID) {
  const token = await getToken();
  let data;
  try {
    ({ data } = await axios.post(
      `${base()}/tokenized/checkout/execute`,
      { paymentID },
      { headers: authHeaders(token), timeout: 30000 }
    ));
  } catch (err) {
    // A failed execute (e.g. already executed / expired) still returns a body.
    data = err.response?.data || { statusMessage: err.message };
  }
  const ok = data.statusCode === '0000' && data.transactionStatus === 'Completed';
  return { ok, trxID: data.trxID || '', amount: data.amount, raw: data };
}

// Optional: query current status without executing.
async function queryStatus(paymentID) {
  const token = await getToken();
  const { data } = await axios.post(
    `${base()}/tokenized/checkout/payment/status`,
    { paymentID },
    { headers: authHeaders(token), timeout: 20000 }
  );
  return data;
}

// callback payload { paymentID, status } -> execute result
async function verify(payload = {}) {
  if (!payload.paymentID) throw fail('Missing paymentID in bKash callback.', 400);
  return execute(payload.paymentID);
}

module.exports = { isConfigured, isEnabled, initiate, execute, verify, queryStatus };
