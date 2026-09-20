const mongoose = require('mongoose');

// An Android phone paired with the server to forward incoming SMS (bKash
// payment receipts). The phone gets a long random token once, at pairing; only
// its SHA-256 hash is stored here. A revoked device is refused immediately.
const smsDeviceSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: 'Android phone', maxlength: 80 },
    tokenHash: { type: String, required: true, unique: true, index: true },
    pairedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastSeenAt: { type: Date, default: null },
    lastIp: { type: String, default: '' },
    appVersion: { type: String, default: '' },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SmsDevice', smsDeviceSchema);
