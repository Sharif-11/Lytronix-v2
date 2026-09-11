const mongoose = require('mongoose');

// One row per auto-reply attempt — whether it ended up posted to the
// customer, silently declined (out of scope / not confident), or failed
// outright (Gemini error, bad JSON). This is diagnostic/audit data only —
// nothing here is ever shown to a customer — so it's fully disposable once
// it ages out (see the TTL index below), unlike ChatMessage history.
const chatAiLogSchema = new mongoose.Schema(
  {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatThread', required: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },

    question: { type: String, trim: true, default: '', maxlength: 4000 },

    provider: { type: String, trim: true, default: 'gemini' },
    model: { type: String, trim: true, default: '' },

    // The model's parsed verdict — null when the call errored or its output
    // couldn't be parsed as JSON at all (see `error` below for why).
    inScope: { type: Boolean, default: null },
    confidence: { type: String, enum: ['high', 'low', null], default: null },
    answer: { type: String, trim: true, default: null, maxlength: 4000 },

    // True only when `answer` actually got posted as a ChatMessage — i.e.
    // inScope:true AND confidence:"high". False covers both a deliberate
    // decline and an error; `error` distinguishes which.
    posted: { type: Boolean, default: false },
    replyMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    // True when this attempt was skipped before ever calling Gemini because
    // the thread had already used its daily auto-reply budget (see
    // chatAi.js MAX_AI_REPLIES_PER_DAY) — distinct from a real decline so
    // the admin can tell "not confident" apart from "budget exhausted".
    capped: { type: Boolean, default: false },

    // Raw model output, for debugging odd/unparseable responses — capped.
    rawOutput: { type: String, default: '', maxlength: 4000 },
    // Non-empty only when the Gemini call itself failed (network, rate
    // limit, bad key) or its output couldn't be parsed as valid JSON at all.
    error: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

chatAiLogSchema.index({ thread: 1, createdAt: -1 });

// Purely diagnostic data — MongoDB expires rows itself past the retention
// window, same pattern as AnalyticsEvent. No manual sweep job needed.
const ttlDays = Math.max(1, Number(process.env.AI_CHAT_LOG_RETENTION_DAYS || 30));
chatAiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });

module.exports = mongoose.model('ChatAiLog', chatAiLogSchema);
