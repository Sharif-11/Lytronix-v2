const axios = require('axios');
const logger = require('./logger');
const { resolveZillaThana } = require('./geoResolve');

// Two interchangeable providers behind one extractOrder() API:
//   - Gemini (Google AI Studio) — has a genuinely free tier, TEXT ONLY for
//     now (image support is coming back once the Gemini image path is wired
//     up — see imageSupported() below). Set GEMINI_API_KEY.
//   - Anthropic (Claude) — the original provider, supports text + image.
//     Set ANTHROPIC_API_KEY.
//
// AI_PROVIDER picks explicitly ('gemini' | 'anthropic'); if unset, Gemini is
// preferred when its key is present (it's free), else Anthropic.
//
// Model IDs drift as providers retire/rename them — GEMINI_MODEL /
// ANTHROPIC_MODEL let you point at whatever's current in your console
// without a code change. Check https://ai.google.dev/gemini-api/docs/models
// for the live list of free-tier-eligible Gemini models.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || 'claude-opus-5';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function provider() {
  const explicit = String(process.env.AI_PROVIDER || '').toLowerCase();
  if (explicit === 'gemini' || explicit === 'anthropic') return explicit;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'gemini'; // default when nothing is configured yet — clearest "not configured" message
}

function isConfigured() {
  return provider() === 'gemini' ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY);
}

// Image extraction is only wired up for the Anthropic path right now — the
// Gemini path is deliberately text-only this round (image support is planned).
function imageSupported() {
  return provider() === 'anthropic';
}

const SYSTEM_PROMPT = `You extract structured e-commerce order details from messy customer-provided input for a Bangladeshi electronics shop (Lytronix). The input may be:
- free-form chat text (Bangla, English, or mixed / romanised Bangla),
- a pasted courier label (e.g. a Steadfast label with Name / Phone / Address / Cash on Delivery),
- an image of any of the above.

Return ONLY a single JSON object, no prose, no markdown fences, with exactly this shape:
{
  "customer": { "name": string, "phone": string, "zilla": string, "thana": string, "address": string },
  "items": [ { "name": string, "quantity": number, "unitPrice": number } ],
  "deliveryCharge": number,
  "advancePaid": number,
  "codAmount": number,
  "notes": string,
  "confidence": "high" | "medium" | "low"
}

Rules:
- "phone": normalise Bangladeshi mobile numbers to 11 digits starting 01 (strip +88 / 88 / spaces / dashes). If not recoverable, "".
- "zilla" = district, "thana" = upazila / police station. Split them out of a combined address line when possible; keep the street/house part in "address". If the input names a town, market, or locality that sits inside a larger upazila (e.g. "Mawna" is a town in Sreepur upazila, Gazipur) rather than the upazila itself, put the parent upazila in "thana" and keep the specific place name in "address". Always write "zilla" and "thana" in English/Latin script (e.g. "Gazipur", "Sreepur") even if the source text has them in Bangla — they're matched against an English district list. Keep "address" in whatever script the customer used.
- Numbers must be plain numbers in BDT (no currency symbols, no commas). Use 0 when unknown.
- "items": if quantities/prices aren't stated, still list the product names with quantity 1 and unitPrice 0.
- Never invent data. Unknown strings -> "", unknown numbers -> 0.
- "confidence": "low" if the input is vague or you had to guess a lot.`;

function parseJsonBlock(text) {
  let s = String(text || '').trim();
  // strip ```json ... ``` fences if the model added them despite instructions
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('AI response did not contain JSON.');
  return JSON.parse(s.slice(first, last + 1));
}

async function callAnthropic({ text, image }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('AI extraction is not configured. Add ANTHROPIC_API_KEY to server/.env.');
    err.statusCode = 400;
    throw err;
  }

  const content = [];
  if (image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  }
  content.push({ type: 'text', text: text || 'Extract the order from the attached image.' });

  let data;
  try {
    const res = await axios.post(
      ANTHROPIC_URL,
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        output_config: { effort: 'low' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 60000,
      }
    );
    data = res.data;
  } catch (err) {
    const apiMsg = err.response?.data?.error?.message || err.message;
    logger.warn('ai.extractOrder: request to Anthropic failed', { error: apiMsg, status: err.response?.status });
    const wrapped = new Error(`AI request failed: ${apiMsg}`);
    wrapped.statusCode = err.response?.status === 401 ? 400 : 502;
    throw wrapped;
  }

  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

async function callGemini({ text }) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error(
      'AI extraction is not configured. Add a free GEMINI_API_KEY from https://aistudio.google.com/apikey to server/.env.'
    );
    err.statusCode = 400;
    throw err;
  }

  let data;
  try {
    const res = await axios.post(
      geminiUrl(GEMINI_MODEL),
      {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: text || 'Extract the order.' }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      },
      {
        headers: { 'content-type': 'application/json' },
        params: { key: process.env.GEMINI_API_KEY },
        timeout: 60000,
      }
    );
    data = res.data;
  } catch (err) {
    const apiMsg = err.response?.data?.error?.message || err.message;
    logger.warn('ai.extractOrder: request to Gemini failed', { error: apiMsg, status: err.response?.status });
    const wrapped = new Error(`AI request failed: ${apiMsg}`);
    // 400 = bad key/model/request; 429 = free-tier rate limit hit — both are
    // "fix your setup / try again shortly", not a server bug.
    wrapped.statusCode = [400, 401, 403, 429].includes(err.response?.status) ? 400 : 502;
    throw wrapped;
  }

  const blockReason = data.promptFeedback?.blockReason;
  if (blockReason) {
    const err = new Error(`Gemini declined to process this input (${blockReason}). Try rephrasing.`);
    err.statusCode = 422;
    throw err;
  }

  const candidate = data.candidates?.[0];
  const outText = (candidate?.content?.parts || []).map((p) => p.text || '').join('\n');
  if (!outText) {
    const why = candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : '';
    const err = new Error(`Gemini returned no usable output${why}.`);
    err.statusCode = 422;
    throw err;
  }
  return outText;
}

// input: { text?, image?: { media_type, data(base64) } }
async function extractOrder({ text, image }) {
  const p = provider();
  if (!isConfigured()) {
    const which = p === 'gemini' ? 'GEMINI_API_KEY (free — get one at https://aistudio.google.com/apikey)' : 'ANTHROPIC_API_KEY';
    const err = new Error(`AI extraction is not configured. Add ${which} to server/.env.`);
    err.statusCode = 400;
    throw err;
  }
  if (!text && !image) {
    const err = new Error('Provide pasted text or an image to extract from.');
    err.statusCode = 400;
    throw err;
  }
  if (image && !imageSupported()) {
    const err = new Error('Image extraction isn’t available yet on the current AI provider — paste the text instead.');
    err.statusCode = 400;
    throw err;
  }

  logger.info('ai.extractOrder: request received', { provider: p, hasText: Boolean(text), hasImage: Boolean(image) });

  // Provider-call failures (bad key, rate limit, network) already carry a
  // statusCode and a specific message — let those propagate as-is. Only a
  // failure to parse the returned text as JSON gets the generic, friendlier
  // "couldn't turn that into an order" message.
  const outText = p === 'gemini' ? await callGemini({ text }) : await callAnthropic({ text, image });

  let draftRaw;
  try {
    draftRaw = parseJsonBlock(outText);
  } catch {
    logger.warn('ai.extractOrder: could not parse a JSON draft from the response', { provider: p });
    const wrapped = new Error('The AI could not turn that into an order. Try adding more detail.');
    wrapped.statusCode = 422;
    throw wrapped;
  }

  const result = normalise(draftRaw);
  logger.info('ai.extractOrder: draft extracted', {
    provider: p,
    confidence: result.confidence,
    itemCount: result.items.length,
    zillaMatched: result.customer.zillaMatched,
    thanaMatched: result.customer.thanaMatched,
  });
  return result;
}

function toNumber(v) {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalisePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('880')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('01')) return digits;
  return '';
}

function normalise(d) {
  const customer = d.customer || {};
  // Map the AI's free-text district/thana guess onto the canonical Packzy
  // (Steadfast) hub list the order form's <select>s are bound to, so a name
  // like "Cumilla" resolves to the exact option the dropdown expects instead
  // of silently not matching anything.
  const resolved = resolveZillaThana({
    zilla: String(customer.zilla || '').trim(),
    thana: String(customer.thana || '').trim(),
  });
  return {
    customer: {
      name: String(customer.name || '').trim(),
      phone: normalisePhone(customer.phone),
      zilla: resolved.zilla,
      thana: resolved.thana,
      zillaMatched: resolved.zillaMatched,
      thanaMatched: resolved.thanaMatched,
      address: String(customer.address || '').trim(),
    },
    items: Array.isArray(d.items)
      ? d.items
          .filter((i) => i && (i.name || i.unitPrice))
          .map((i) => ({
            name: String(i.name || '').trim(),
            quantity: Math.max(1, Math.round(toNumber(i.quantity)) || 1),
            unitPrice: toNumber(i.unitPrice),
          }))
      : [],
    deliveryCharge: toNumber(d.deliveryCharge),
    advancePaid: toNumber(d.advancePaid),
    codAmount: toNumber(d.codAmount),
    notes: String(d.notes || '').trim(),
    confidence: ['high', 'medium', 'low'].includes(d.confidence) ? d.confidence : 'low',
  };
}

module.exports = {
  isConfigured,
  imageSupported,
  extractOrder,
  get PROVIDER() {
    return provider();
  },
  get MODEL() {
    return provider() === 'gemini' ? GEMINI_MODEL : ANTHROPIC_MODEL;
  },
};
