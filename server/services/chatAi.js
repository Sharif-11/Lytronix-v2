const Product = require('../models/Product');
const ChatMessage = require('../models/ChatMessage');
const ChatAiSettings = require('../models/ChatAiSettings');
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

function parseAnswer(outText) {
  let parsed;
  try {
    parsed = ai.parseJsonBlock(outText);
  } catch {
    return null;
  }
  if (!parsed || parsed.inScope !== true || parsed.confidence !== 'high') return null;
  const answer = String(parsed.answer || '').trim();
  return answer || null;
}

// Called after a customer's text message is saved (fire-and-forget from
// chatController.customerSend — never blocks or fails their request).
// `thread` is a Mongoose ChatThread document; `message` the just-created
// ChatMessage document.
async function maybeAutoReply(thread, message) {
  try {
    if (message.type !== 'text' || message.mediaUrl) return; // belt-and-suspenders — caller already filters this

    const settings = await ChatAiSettings.load();
    if (!settings.enabled) return;
    if (!ai.isGeminiConfigured()) return;

    const [catalogueText, transcript] = await Promise.all([
      buildCatalogueText(),
      buildRecentTranscript(thread._id, message._id),
    ]);

    const userPrompt = `PRODUCT CATALOGUE:\n${catalogueText}\n\nKNOWLEDGE BASE:\n${settings.knowledgeBase || '(none provided)'}\n\nRECENT CONVERSATION:\n${transcript || '(none)'}\n\nQUESTION:\n${message.body}`;

    const outText = await ai.callGemini({ text: userPrompt, systemPrompt: SYSTEM_PROMPT });
    const answer = parseAnswer(outText);
    if (!answer) {
      logger.info('chatAi: declined to auto-reply', { phone: thread.phone.slice(-4) });
      return;
    }

    const reply = await ChatMessage.create({
      thread: thread._id,
      phone: thread.phone,
      from: 'admin',
      senderName: 'Lytronix (স্বয়ংক্রিয় উত্তর)', // "automated reply" — kept visible to the customer for transparency
      isAiReply: true,
      type: 'text',
      body: answer,
      readByAdmin: false,
      deliveredToAdmin: false,
    });

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
    // Never let an AI hiccup affect the customer's own message flow —
    // this runs fire-and-forget after their message is already saved.
    logger.warn('chatAi: auto-reply failed', { error: err.message });
  }
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
