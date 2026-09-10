const mongoose = require('mongoose');

// One row per browser/device that has granted push permission.
// `endpoint` is the push-service URL and is globally unique per subscription.
//   audience 'admin'    — every staff device; broadcast on any notification.
//   audience 'customer' — a shopper's device; targeted by `phone`.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    audience: { type: String, enum: ['admin', 'customer'], default: 'admin', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // admin
    customerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerAccount', default: null, index: true },
    phone: { type: String, default: '', index: true }, // customer audience — the shopper's phone
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
