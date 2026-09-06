const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'order_new', // a customer placed an order on the storefront
  'courier_status', // Steadfast delivery_status webhook
  'courier_tracking', // Steadfast tracking_update webhook
  'payment_review', // a manual bKash payment needs verification
  'chat', // a customer sent a message in live chat
  'system', // anything else worth surfacing (e.g. webhook for an unknown parcel)
];

// A single feed of events for the admin notification bar. Notifications are
// global (every staff member sees the same feed); "read" is tracked per user
// via `readBy`. Rows self-expire after 90 days.
const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    severity: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },

    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    link: { type: String, trim: true, default: '' }, // admin route to open on click, e.g. /orders/<id>
    meta: { type: mongoose.Schema.Types.Mixed, default: null }, // raw payload, for debugging

    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
