const Product = require('../models/Product');
const ChatMessage = require('../models/ChatMessage');
const ChatAiSettings = require('../models/ChatAiSettings');
const ChatAiLog = require('../models/ChatAiLog');
const ai = require('./ai');
const webPush = require('./webPush');
const logger = require('./logger');

// Automated first-line answers for the storefront chat widget: text-only
// customer questions get checked against the live catalogue + an admin-
// edited knowledge base, and only answered when the model is fully
// confident the material given to it actually covers the question.
// Everything else — including every image/voice message, since this never
// even gets called for those (see chatController.customerSend) — is left
// for a human, silently. Deliberately Gemini-only (free tier); if
// GEMINI_API_KEY isn't set, this is a no-op rather than falling back to a
// paid provider for something that's meant to be free.

const MAX_PRODUCTS = 50; // matches the shop's actual catalogue size — no pagination needed
const MAX_DESC_CHARS = 400;
const HISTORY_MESSAGES = 6; // just enough for "what about the second one" style follow-ups

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function buildCatalogueText() {
  const products = await Product.find({ isActive: true })
    .select('name price description stock trackInventory')
    .sort({ name: 1 })
    .limit(MAX_PRODUCTS)
    .lean();

  if (!products.length) return '(no active products)';

  return products
    .map((p) => {
      const stockLine = p.trackInventory ? (p.stock > 0 ? `${p.stock} in stock` : 'out of stock') : 'made to order';
      const desc = stripHtml(p.description).slice(0, MAX_DESC_CHARS);
      return `- ${p.name} — ৳${p.price} (${stockLine})${desc ? `\n  ${desc}` : ''}`;
    })
    .join('\n');
}

async function buildRecentTranscript(threadId, beforeMessageId) {
  const rows = await ChatMessage.find({
    thread: threadId,
    _id: { $ne: beforeMessageId },
    deletedAt: null,
    type: 'text',
  })
    .sort({ createdAt: -1 })
    .limit(HISTORY_MESSAGES)
    .select('from body')
    .lean();

  return rows
    .reverse()
    .map((m) => `${m.from === 'customer' ? 'Customer' : 'Shop'}: ${m.body}`)
    .join('\n');
}

const SYSTEM_PROMPT = `You are a customer support assistant for Lytronix, a Bangladeshi shop selling lithium battery cells, assembled battery packs, and BMS (battery management systems) — NOT power banks or general chargers.

You are given, in order:
1. PRODUCT CATALOGUE — every product currently actually sold (name, price, stock, description).
2. KNOWLEDGE BASE — extra notes an admin wrote for questions the catalogue alone doesn't answer (e.g. "we don't stock that exact configuration, but X is the closest substitute").
3. RECENT CONVERSATION — the last few messages between this customer and the shop, for context on follow-ups.
4. QUESTION — the customer's newest message.

Answer ONLY using facts stated in the catalogue and knowledge base above. Never guess or invent prices, stock levels, specifications, delivery times, order status, discounts, warranty terms, or availability that isn't explicitly given to you.

Decline (do not answer) whenever:
- the question needs information you weren't given (order status, payment/refund issues, complaints, custom pricing negotiation, anything account-specific),
- it's a greeting, small talk, or anything not actually asking about a product,
- the catalogue and knowledge base together don't fully cover it,
- you are anything less than fully confident the answer is correct and complete.

A human always handles what you decline — so default to declining. A wrong or hallucinated answer is far worse than silence.

Reply in the SAME language/script the customer used (Bangla, English, or mixed/Banglish).

Return ONLY a single JSON object, no prose, no markdown fences, with exactly this shape:
{
  "inScope": boolean,
  "confidence": "high" | "low",
  "answer": string | null
}
"answer" must be null unless inScope is true AND confidence is "high".`;

// Parses the model's JSON verdict without throwing. Returns the raw parsed
// object (whatever shape it came back in) or null if it wasn't valid JSON
// at all — callers decide what counts as "safe to post" themselves.
function parseVerdict(outText) {
  try {
    return ai.parseJsonBlock(outText);
  } catch {
    return null;
  }
}

// Every attempt gets logged — posted, silently declined, or errored — so
// nothing about the assistant's behavior is invisible even when the
// customer never sees a reply. Never throws: a logging failure must not be
// able to affect the (already fire-and-forget) caller.
async function writeLog({ thread, message, verdict, outText, posted, replyMessageId, error }) {
  try {
    await ChatAiLog.create({
      thread: thread._id,
      phone: thread.phone,
      question: message.body,
      provider: 'gemini',
      model: ai.GEMINI_MODEL,
      inScope: verdict && typeof verdict.inScope === 'boolean' ? verdict.inScope : null,
      confidence: verdict && ['high', 'low'].includes(verdict.confidence) ? verdict.confidence : null,
      answer: verdict && verdict.answer != null ? String(verdict.answer).slice(0, 4000) : null,
      posted: Boolean(posted),
      replyMessage: replyMessageId || null,
      rawOutput: outText ? String(outText).slice(0, 4000) : '',
      error: error || '',
    });
  } catch (err) {
    logger.warn('chatAi: failed to write log', { error: err.message });
  }
}

// Called after a customer's text message is saved (fire-and-forget from
// chatController.customerSend — the caller never awaits or catches this,
// so an unhandled rejection here would be an unhandled rejection process-
// wide). This wrapper guarantees it never throws; the real work is in
// runAutoReply below.
async function maybeAutoReply(thread, message) {
  try {
    await runAutoReply(thread, message);
  } catch (err) {
    logger.warn('chatAi: auto-reply failed', { error: err.message });
  }
}

async function runAutoReply(thread, message) {
  if (message.type !== 'text' || message.mediaUrl) return; // belt-and-suspenders — caller already filters this

  const settings = await ChatAiSettings.load();
  if (!settings.enabled) return;
  if (!ai.isGeminiConfigured()) return;

  let outText = null;
  let verdict = null;
  let errorMsg = '';

  try {
    const [catalogueText, transcript] = await Promise.all([
      buildCatalogueText(),
      buildRecentTranscript(thread._id, message._id),
    ]);
    const userPrompt = `PRODUCT CATALOGUE:\n${catalogueText}\n\nKNOWLEDGE BASE:\n${settings.knowledgeBase || '(none provided)'}\n\nRECENT CONVERSATION:\n${transcript || '(none)'}\n\nQUESTION:\n${message.body}`;
    outText = await ai.callGemini({ text: userPrompt, systemPrompt: SYSTEM_PROMPT });
    verdict = parseVerdict(outText);
    if (!verdict) errorMsg = 'AI response was not valid JSON.';
  } catch (err) {
    errorMsg = err.message;
  }

  const answer =
    !errorMsg && verdict && verdict.inScope === true && verdict.confidence === 'high'
      ? String(verdict.answer || '').trim()
      : '';

  let replyMessageId = null;
  if (answer) {
    try {
      const reply = await ChatMessage.create({
        thread: thread._id,
        phone: thread.phone,
        from: 'admin',
        senderName: 'Lytronix (অটোমেটেড রিপ্লাই)', // "automated reply" — kept visible to the customer for transparency
        isAiReply: true,
        type: 'text',
        body: answer,
        readByAdmin: false,
        deliveredToAdmin: false,
      });
      replyMessageId = reply._id;

      thread.lastMessageAt = reply.createdAt;
      thread.lastMessagePreview = answer.slice(0, 120);
      thread.lastMessageFrom = 'admin';
      thread.unreadForCustomer += 1;
      await thread.save();

      webPush
        .notifyCustomer(thread.phone, {
          title: 'Lytronix — নতুন বার্তা',
          body: answer.slice(0, 120),
          url: '/shop?chat=1',
          tag: `chat-${thread.phone}`,
          badge: thread.unreadForCustomer,
        })
        .catch(() => {});

      logger.info('chatAi: auto-replied', { phone: thread.phone.slice(-4) });
    } catch (err) {
      // The verdict was fine but posting it failed (DB hiccup) — log as an
      // error rather than a silent decline, since the model did its job.
      errorMsg = err.message;
    }
  } else if (errorMsg) {
    logger.warn('chatAi: auto-reply failed', { error: errorMsg });
  } else {
    logger.info('chatAi: declined to auto-reply', { phone: thread.phone.slice(-4) });
  }

  await writeLog({ thread, message, verdict, outText, posted: Boolean(replyMessageId), replyMessageId, error: errorMsg });
}

module.exports = {
  maybeAutoReply,
  getSettings: () => ChatAiSettings.load(),
  async updateSettings({ enabled, knowledgeBase, userId }) {
    const settings = await ChatAiSettings.load();
    if (enabled !== undefined) settings.enabled = Boolean(enabled);
    if (knowledgeBase !== undefined) settings.knowledgeBase = String(knowledgeBase).slice(0, 20000);
    settings.updatedBy = userId || null;
    await settings.save();
    return settings;
  },
};
