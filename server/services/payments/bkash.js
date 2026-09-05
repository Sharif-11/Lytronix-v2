// bKash Tokenized Checkout integration point.
//
// This is deliberately a stub: real bKash automated checkout needs merchant
// sandbox/live credentials (app key/secret + username/password), an OAuth
// grant-token exchange, then their create-payment / execute-payment REST
// calls. None of that is guessable or fake-able, so until real credentials
// are supplied this gateway reports itself as "not configured" and callers
// (the order controller) fall back to offering Cash on Delivery / bKash
// manual instead of silently failing.
//
// To go live: fill in BKASH_* in server/.env, then implement:
//   1. getToken()      -> POST {base}/tokenized/checkout/token/grant
//   2. initiate()       -> POST {base}/tokenized/checkout/create with amount,
//                           invoice (order.orderNumber), and a callback URL
//                           that points back at
//                           POST /api/orders/:id/payments/bkash/callback
//   3. verify(payload)  -> POST {base}/tokenized/checkout/execute with the
//                           paymentID bKash sends back on redirect, then mark
//                           the matching Payment as verified/failed.

function isConfigured() {
  return Boolean(
    process.env.BKASH_APP_KEY &&
      process.env.BKASH_APP_SECRET &&
      process.env.BKASH_USERNAME &&
      process.env.BKASH_PASSWORD
  );
}

async function initiate() {
  const err = new Error(
    'bKash automated checkout isn\u2019t configured yet. Add BKASH_APP_KEY / BKASH_APP_SECRET / BKASH_USERNAME / BKASH_PASSWORD to server/.env, or use bKash manual transfer / Cash on Delivery for now.'
  );
  err.statusCode = 400;
  throw err;
}

async function verify() {
  const err = new Error('bKash automated checkout isn\u2019t configured yet.');
  err.statusCode = 400;
  throw err;
}

module.exports = { isConfigured, initiate, verify };
