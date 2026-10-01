const SmsSettings = require('../models/SmsSettings');

// In-memory copy of which automatic SMS events are switched on, so
// notifications.js can read it without a query. Refreshed on every admin
// change and every minute; until the first load everything is on.
let cache = Object.fromEntries(SmsSettings.EVENTS.map((e) => [e, true]));

function pick(doc) {
  return Object.fromEntries(SmsSettings.EVENTS.map((e) => [e, doc[e] !== false]));
}

async function refresh() {
  try {
    cache = pick(await SmsSettings.load());
  } catch {
    /* keep the last known values */
  }
  return cache;
}

function get() {
  return cache;
}

async function update(patch, userId) {
  const doc = await SmsSettings.load();
  SmsSettings.EVENTS.forEach((e) => {
    if (typeof patch[e] === 'boolean') doc[e] = patch[e];
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
