const axios = require('axios');
const logger = require('./logger');
const { resolveZillaThana } = require('./geoResolve');

// Raw HTTP to the Anthropic Messages API — matches how every other external
// integration in this codebase is wired (steadfast.js, sms.js, cloudinary via
// its own SDK). Set ANTHROPIC_API_KEY in server/.env to enable; without it the
// admin's "AI assist" panel reports "not configured" and the order form still
// works normally.
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.AI_MODEL || 'claude-opus-5';

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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
- "zilla" = district, "thana" = upazila / police station. Split them out of a combined address line when possible; keep the street/house part in "address".
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

// input: { text?, image?: { media_type, data(base64) } }
async function extractOrder({ text, image }) {
  if (!isConfigured()) {
    const err = new Error('AI extraction is not configured. Add ANTHROPIC_API_KEY to server/.env.');
    err.statusCode = 400;
    throw err;
  }
  if (!text && !image) {
    const err = new Error('Provide pasted text or an image to extract from.');
    err.statusCode = 400;
    throw err;
  }

  logger.info('ai.extractOrder: request received', { hasText: Boolean(text), hasImage: Boolean(image), model: MODEL });

  const content = [];
  if (image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.media_type, data: image.data },
    });
  }
  content.push({ type: 'text', text: text || 'Extract the order from the attached image.' });

  let data;
  try {
    const res = await axios.post(
      API_URL,
      {
        model: MODEL,
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

  const outText = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  let draft;
  try {
    draft = parseJsonBlock(outText);
  } catch (err) {
    logger.warn('ai.extractOrder: could not parse a JSON draft from the response');
    const wrapped = new Error('The AI could not turn that into an order. Try adding more detail.');
    wrapped.statusCode = 422;
    throw wrapped;
  }

  const result = normalise(draft);
  logger.info('ai.extractOrder: draft extracted', {
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
  // list the order form's <select>s use, so a name like "Cumilla" resolves
  // to the exact option the dropdown expects instead of silently not
  // matching anything.
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

module.exports = { isConfigured, extractOrder, MODEL };
