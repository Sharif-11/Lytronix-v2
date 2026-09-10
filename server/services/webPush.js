// Web Push fan-out for the admin PWA. Every admin notification (see
// services/notificationCenter.js) and every new customer chat message also
// goes out as a browser push so a backgrounded / closed admin app still
// alerts with sound.
//
// Requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generate once with:
//   node -e "console.log(require('web-push').generateVAPIDKeys())"
// ) and VAPID_SUBJECT (a mailto: or https: contact URL). When unset the
// module is inert — nothing is sent, nothing throws.

const webpush = require('web-push');
const logger = require('./logger');
const PushSubscription = require('../models/PushSubscription');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@lytronix.local';

let ready = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    ready = true;
  } catch (err) {
    logger.error('webPush: bad VAPID config', { error: err.message });
  }
}

function isConfigured() {
  return ready;
}

function publicKey() {
  return PUBLIC_KEY;
}

// Fire-and-forget send to every subscription matching `filter`. Dead ones
// (404/410) are pruned. Never throws.
// `badge` may be a number (same for all) or an async fn (sub) => number, so
// the app-icon badge can be personalised per recipient.
async function send(filter, { title, body = '', url = '/', tag = 'lytronix', data = {}, badge } = {}) {
  if (!ready) return;
  let subs;
  try {
    subs = await PushSubscription.find(filter).lean();
  } catch (err) {
    logger.error('webPush: could not load subscriptions', { error: err.message });
    return;
  }
  if (!subs.length) return;

  const base = { title, body, url, tag, data, at: Date.now() };
  const dead = [];

  await Promise.all(
    subs.map(async (s) => {
      let obj = base;
      try {
        if (typeof badge === 'function') obj = { ...base, badge: Number(await badge(s)) || 0 };
        else if (typeof badge === 'number') obj = { ...base, badge };
      } catch {
        /* badge is best-effort */
      }
      return webpush
        .sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(obj), {
          TTL: 600,
          urgency: 'high',
        })
        .catch((err) => {
          const code = err.statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
          else logger.warn('webPush: send failed', { code, endpoint: s.endpoint.slice(0, 40) });
        });
    })
  );

  if (dead.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: dead } }).catch(() => {});
    logger.info('webPush: pruned dead subscriptions', { count: dead.length });
  }
}

// Broadcast to every admin device.
const notifyAll = (msg) => send({ audience: 'admin' }, msg);

// Target one shopper's devices by phone.
function notifyCustomer(phone, msg) {
  const p = String(phone || '').replace(/\D/g, '');
  if (!/^01\d{9}$/.test(p)) return Promise.resolve();
  return send({ audience: 'customer', phone: p }, msg);
}

module.exports = { isConfigured, publicKey, notifyAll, notifyCustomer };
