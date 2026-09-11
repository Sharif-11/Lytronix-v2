const messenger = require('../services/messenger');
const chatController = require('./chatController');
const logger = require('../services/logger');

const MAX_BODY = 4000;

// Facebook attachments (image/audio/video/file/fallback) map onto the same
// ChatMessage.type enum the storefront widget uses ('text'|'image'|'voice')
// where there's a direct match; anything else becomes a short text note so
// the message isn't silently dropped from the thread's history.
function contentFromMessengerEvent(evt) {
  if (evt.attachment?.url) {
    if (evt.attachment.type === 'image') {
      return { type: 'image', body: '', mediaUrl: evt.attachment.url, mediaMime: 'image/jpeg', durationSec: 0 };
    }
    if (evt.attachment.type === 'audio') {
      return { type: 'voice', body: '', mediaUrl: evt.attachment.url, mediaMime: 'audio/mpeg', durationSec: 0 };
    }
    // video/file/fallback — no matching ChatMessage type; keep a text note
    // with the link rather than drop the message entirely.
    return { type: 'text', body: `[${evt.attachment.type} attachment] ${evt.attachment.url}`.slice(0, MAX_BODY), mediaUrl: '', mediaMime: '', durationSec: 0 };
  }
  const body = String(evt.text || '').trim().slice(0, MAX_BODY);
  if (!body) return null; // e.g. a like/sticker this integration doesn't represent — nothing to store
  return { type: 'text', body, mediaUrl: '', mediaMime: '', durationSec: 0 };
}

// GET /api/messenger/webhook — one-time verification handshake when you
// paste this URL into the Facebook App's Messenger webhook settings.
exports.verify = (req, res) => {
  const challenge = messenger.verifyWebhookChallenge(req.query);
  if (challenge) return res.status(200).send(challenge);
  res.sendStatus(403);
};

// POST /api/messenger/webhook — Facebook retries aggressively on anything
// but a fast 200, so this responds immediately and processes events in the
// background. That background work is fully self-contained (own try/catch
// per event) — nothing here may throw after the response is sent, since
// this app's error middleware doesn't check res.headersSent.
exports.receive = (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!messenger.verifySignature(req.rawBody, signature)) {
    logger.warn('messenger: webhook signature verification failed');
    return res.sendStatus(401);
  }

  res.sendStatus(200);

  const events = messenger.parseWebhookEvents(req.body);
  for (const evt of events) {
    processEvent(evt).catch((err) => logger.warn('messenger: failed to process webhook event', { error: err.message }));
  }
};

async function processEvent(evt) {
  const content = contentFromMessengerEvent(evt);
  if (!content) return;
  const thread = await chatController.findOrCreateMessengerThread(evt.psid);
  await chatController.ingestCustomerMessage(thread, content);
}
