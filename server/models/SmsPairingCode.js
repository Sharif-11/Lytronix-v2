const mongoose = require('mongoose');

// One-time code an admin generates in the panel and types into the phone app.
// Stored hashed, valid for a few minutes, consumed on first use. MongoDB drops
// the row itself shortly after it expires.
const smsPairingCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsDevice', default: null },
  },
  { timestamps: true }
);

smsPairingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('SmsPairingCode', smsPairingCodeSchema);
