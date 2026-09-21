const mongoose = require('mongoose');

// One row per inbound provider callback (currently Steadfast) — the full raw
// payload exactly as received, plus what we did with it. Diagnostic/audit
// data: it's how you answer "did Steadfast actually call us, and what did it
// send?" after the fact. Rejected calls (bad token, missing ids, unknown
// parcel) are logged too, since those are the ones you most need to see.
const webhookLogSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'steadfast', index: true },
    notificationType: { type: String, default: '' },
    consignmentId: { type: String, default: '' },
    invoice: { type: String, default: '' },
    status: { type: String, default: '' },

    // Raw body as received (Authorization header is never stored).
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    headers: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },

    outcome: {
      type: String,
      enum: ['received', 'processed', 'noted', 'duplicate', 'unauthorized', 'invalid', 'unknown_order', 'error'],
      default: 'received',
      index: true,
    },
    // Steadfast's Idempotency-Key (the same on retries of one event) and whether the
    // X-Signature checked out: valid | invalid | absent (right token, unsigned) | not_checked.
    idempotencyKey: { type: String, default: '', index: true },
    signatureStatus: { type: String, default: '' },
    note: { type: String, default: '' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    orderNumber: { type: String, default: '' },
    previousStatus: { type: String, default: '' },
    newStatus: { type: String, default: '' },
  },
  { timestamps: true }
);

webhookLogSchema.index({ createdAt: -1 });

const ttlDays = Math.max(1, Number(process.env.WEBHOOK_LOG_RETENTION_DAYS || 90));
webhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookLog', webhookLogSchema);
