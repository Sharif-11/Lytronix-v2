const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// One row per phone number with an in-flight login OTP. The code itself is
// only ever stored hashed. Rows self-destruct via a TTL index once expired,
// so stale codes never linger. Rate limiting (sends/hour, min gap between
// sends, verify attempts) is enforced in the auth controller against this row.
const otpRequestSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, unique: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['login'], default: 'login' },

    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }, // failed verify attempts against the current code
    consumedAt: { type: Date, default: null },

    sendCount: { type: Number, default: 0 }, // sends within the current rolling window
    windowStartedAt: { type: Date, default: Date.now },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongo removes the doc automatically once `expiresAt` passes.
otpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

otpRequestSchema.methods.setCode = async function setCode(plainCode) {
  this.codeHash = await bcrypt.hash(String(plainCode), 8);
};

otpRequestSchema.methods.compareCode = function compareCode(plainCode) {
  return bcrypt.compare(String(plainCode), this.codeHash);
};

module.exports = mongoose.model('OtpRequest', otpRequestSchema);
