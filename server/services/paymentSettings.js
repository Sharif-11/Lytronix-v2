const PaymentSettings = require('../models/PaymentSettings');

// In-memory copy of which payment methods are switched on, so synchronous
// callers (e.g. bkashAutoEnabled) can read it without a query. Refreshed on
// every admin change and every minute; until the first load everything is on.
let cache = Object.fromEntries(PaymentSettings.METHODS.map((m) => [m, true]));

function pick(doc) {
  return Object.fromEntries(PaymentSettings.METHODS.map((m) => [m, doc[m] !== false]));
}

async function refresh() {
  try {
    cache = pick(await PaymentSettings.load());
  } catch {
    /* keep the last known values */
  }
  return cache;
}

function get() {
  return cache;
}

async function update(patch, userId) {
  const doc = await PaymentSettings.load();
  PaymentSettings.METHODS.forEach((m) => {
    if (typeof patch[m] === 'boolean') doc[m] = patch[m];
  });
  doc.updatedBy = userId || null;
  await doc.save();
  cache = pick(doc);
  return cache;
}

function startRefreshing() {
  refresh();
  setInterval(refresh, 60 * 1000).unref?.();
}

module.exports = { get, refresh, update, startRefreshing };
