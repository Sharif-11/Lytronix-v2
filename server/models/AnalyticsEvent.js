const mongoose = require('mongoose');

const EVENT_TYPES = [
  'site_visit', // one per anonymous session, per visit
  'product_view', // a product detail page opened
  'category_view', // a category page opened
  'add_to_cart',
  'checkout_started',
  'order_placed',
];

// Append-only stream of lightweight storefront events. All reporting
// (visitors, most-viewed, most-ordered, trends) is computed by aggregating
// this collection on the fly + joining Orders — there is no rollup table.
// Raw rows expire after ANALYTICS_EVENT_TTL_DAYS (default 180) to keep the
// collection bounded; the running totals on Product survive that.
const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    // Anonymous per-browser id (localStorage) — a "visitor" is a distinct
    // sessionId within a date range.
    sessionId: { type: String, trim: true, default: '', index: true },
    // Set when the visitor is a logged-in storefront customer.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerAccount', default: null },

    path: { type: String, trim: true, default: '' },
    referrer: { type: String, trim: true, default: '' },
    // Order revenue snapshot, only on `order_placed`, so revenue trends don't
    // need a second collection join per bucket.
    value: { type: Number, default: 0 },

    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

analyticsEventSchema.index({ type: 1, at: -1 });
analyticsEventSchema.index({ product: 1, at: -1 });

const ttlDays = Number(process.env.ANALYTICS_EVENT_TTL_DAYS || 180);
analyticsEventSchema.index({ at: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
