const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

// Facebook Messenger Platform (free — no per-message charge, unlike WhatsApp
// Business API). Getting real customer traffic flowing through this needs,
// outside of this code: a Facebook Page, a Facebook App with Messenger
// added, a generated Page Access Token, and — to message anyone who isn't
// an admin/tester on the app — Meta App Review + Business Verification for
// the pages_messaging permission. None of that is something this service
// can do for you; it's the actual bottleneck, not engineering time.

const GRAPH_VERSION = 'v19.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages`;

function isConfigured() {
  return Boolean(process.env.MESSENGER_PAGE_ACCESS_TOKEN);
}

// GET /api/messenger/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// Facebook calls this once, when you paste the webhook URL into the app's
// dashboard, to confirm you control the endpoint. Returns the raw challenge
// string to echo back, or null if the verify token didn't match.
function verifyWebhookChallenge(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token && process.env.MESSENGER_VERIFY_TOKEN && token === process.env.MESSENGER_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

// Every webhook POST is signed with your App Secret over the raw request
// body (server.js's express.json({ verify }) stashes that on req.rawBody).
// Without MESSENGER_APP_SECRET set, this is skipped with a loud warning —
// fine for local testing against a tunnel, never for production.
function verifySignature(rawBody, signatureHeader) {
  const appSecret = process.env.MESSENGER_APP_SECRET;
  if (!appSecret) {
    logger.warn('messenger: MESSENGER_APP_SECRET not set — webhook signature NOT verified');
    return true;
  }
  if (!signatureHeader || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch etc. — definitely not equal
  }
}

// Normalises Facebook's webhook payload into the handful of things
// chatController actually needs, ignoring event types this integration
// doesn't handle (delivery/read receipts, postbacks, echoes of our own
// sent messages).
//   { psid, mid, text, attachment: { type, url } | null }[]
function parseWebhookEvents(body) {
  const events = [];
  for (const entry of body.entry || []) {
    for (const evt of entry.messaging || []) {
      if (!evt.message || evt.message.is_echo) continue; // skip delivery/read/postback/our-own-echo
      const psid = evt.sender?.id;
      if (!psid) continue;
      const msg = evt.message;
      const att = (msg.attachments || [])[0];
      events.push({
        psid,
        mid: msg.mid,
        text: msg.text || '',
        attachment: att ? { type: att.type, url: att.payload?.url || '' } : null,
      });
    }
  }
  return events;
}

// Sends a plain text reply. Facebook requires this within 24h of the user's
// last message for standard messaging (fits reactive support fine — this
// integration never initiates a conversation).
async function sendText(psid, text) {
  if (!isConfigured()) {
    const err = new Error('Messenger is not configured — add MESSENGER_PAGE_ACCESS_TOKEN to server/.env.');
    err.statusCode = 400;
    throw err;
  }
  try {
    await axios.post(
      GRAPH_URL,
      { recipient: { id: psid }, message: { text } },
      { params: { access_token: process.env.MESSENGER_PAGE_ACCESS_TOKEN }, timeout: 15000 }
    );
  } catch (err) {
    const apiMsg = err.response?.data?.error?.message || err.message;
    logger.warn('messenger: sendText failed', { error: apiMsg, status: err.response?.status });
    const wrapped = new Error(`Messenger send failed: ${apiMsg}`);
    wrapped.statusCode = err.response?.status === 401 ? 400 : 502;
    throw wrapped;
  }
}

module.exports = {
  isConfigured,
  verifyWebhookChallenge,
  verifySignature,
  parseWebhookEvents,
  sendText,
};
