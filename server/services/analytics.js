const crypto = require('crypto');
const AnalyticsEvent = require('../models/AnalyticsEvent');

// Ignore repeat views from the same visitor within this window.
const DEDUPE_MS = Math.max(0, Number(process.env.ANALYTICS_DEDUPE_MINUTES || 30)) * 60 * 1000;
// IPs are only ever stored hashed (with a salt) so we can de-dupe without
// retaining raw addresses.
const IP_SALT = process.env.ANALYTICS_IP_SALT || process.env.JWT_SECRET || 'lytronix-analytics';

function clientIp(req) {
  if (!req) return '';
  return (
    req.headers['cf-connecting-ip'] ||
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    ''
  );
}

function hashIp(ip) {
  if (!ip) return '';
  return crypto.createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex').slice(0, 32);
}

// Fire-and-forget event recording. Never throws into the caller — a failed
// analytics write must not break a checkout or a page load.
function record(event) {
  return AnalyticsEvent.create({ at: new Date(), ...event }).catch((err) => {
    console.error('analytics.record failed:', err.message);
  });
}

/**
 * Record a passive "view" event, but skip it when the same visitor already
 * logged the same view recently. A "visitor" is matched by any of:
 * sessionId (per-browser id), logged-in customer, or hashed client IP.
 * Returns { deduped: boolean } so callers can also skip side effects
 * (e.g. bumping Product.viewCount).
 */
async function recordView(event, req) {
  try {
    const ipHash = hashIp(clientIp(req));

    if (DEDUPE_MS > 0) {
      const identities = [];
      if (event.sessionId) identities.push({ sessionId: event.sessionId });
      if (event.customer) identities.push({ customer: event.customer });
      if (ipHash) identities.push({ ipHash });

      if (identities.length) {
        const q = {
          type: event.type,
          at: { $gte: new Date(Date.now() - DEDUPE_MS) },
          $or: identities,
        };
        if (event.product) q.product = event.product;
        if (event.category) q.category = event.category;

        if (await AnalyticsEvent.exists(q)) return { deduped: true };
      }
    }

    await AnalyticsEvent.create({ at: new Date(), ...event, ipHash });
    return { deduped: false };
  } catch (err) {
    console.error('analytics.recordView failed:', err.message);
    return { deduped: false };
  }
}

module.exports = { record, recordView, clientIp, hashIp };
