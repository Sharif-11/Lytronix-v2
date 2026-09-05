const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// One row per phone number tracking login-OTP activity. The code itself is
// only ever stored hashed. The row is NOT auto-expired — it persists so the
// lifetime send cap survives long past any single code's validity. Rate
// limiting (per-day cap, 24h throttle, lifetime cap, min gap, verify
// attempts) is enforced in the auth controller against this row; an admin can
// wipe it via the OTP-reset endpoint.
const otpRequestSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, unique: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['login'], default: 'login' },

    expiresAt: { type: Date, required: true }, // current code's validity only (checked on verify)
    attempts: { type: Number, default: 0 }, // failed verify attempts against the current code
    consumedAt: { type: Date, default: null },

    sendCount: { type: Number, default: 0 }, // sends within the current 24h window
    windowStartedAt: { type: Date, default: Date.now }, // start of the current 24h window
    lifetimeCount: { type: Number, default: 0 }, // total codes ever sent to this number
    blockedUntil: { type: Date, default: null }, // day-throttle: no new codes until this time
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

otpRequestSchema.methods.setCode = async function setCode(plainCode) {
  this.codeHash = await bcrypt.hash(String(plainCode), 8);
};

otpRequestSchema.methods.compareCode = function compareCode(plainCode) {
  return bcrypt.compare(String(plainCode), this.codeHash);
};

const OtpRequest = mongoose.model('OtpRequest', otpRequestSchema);

// Legacy DBs had a TTL index on expiresAt that auto-deleted rows — which would
// silently wipe the lifetime send cap along with them. Drop it if present.
// Buffered until the connection is ready; a "not found" rejection is expected
// on a fresh DB and ignored.
OtpRequest.collection
  .dropIndex('expiresAt_1')
  .then(() => console.log('[OtpRequest] dropped legacy TTL index expiresAt_1'))
  .catch(() => {});

module.exports = OtpRequest;
