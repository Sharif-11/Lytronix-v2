const mongoose = require('mongoose');

// One row per Steadfast payout we have seen. It doubles as a cache: a payout
// that is already 'paid' and processed is never fetched again, so syncing costs
// one list call in the normal case.
const steadfastPayoutSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true, index: true }, // e.g. SFC-31556147
    statusLabel: { type: String, default: '' }, // 'paid', ...
    method: { type: String, default: '' },
    amount: { type: Number, default: 0 }, // COD of the delivered parcels
    dueBills: { type: Number, default: 0 },
    charges: { type: Number, default: 0 },
    total: { type: Number, default: 0 }, // what reached us: amount - dueBills - charges
    parcelCount: { type: Number, default: 0 },
    matchedOrders: { type: Number, default: 0 }, // parcels that belong to one of our orders
    createdAtRemote: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    processedAt: { type: Date, default: null }, // set once the parcels were matched (only for paid payouts)
  },
  { timestamps: true }
);

module.exports = mongoose.model('SteadfastPayout', steadfastPayoutSchema);
