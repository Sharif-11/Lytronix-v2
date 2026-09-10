const mongoose = require('mongoose');

// One row per browser/device that has granted the admin PWA push permission.
// `endpoint` is the push-service URL and is globally unique per subscription.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
