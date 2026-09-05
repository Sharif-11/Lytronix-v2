const mongoose = require('mongoose');

// One record per payment attempt/intent, regardless of method. This is the
// persistent, audit-friendly log the storefront's payment flow writes to —
// separate from Order.payments (which is the running ledger used to compute
// what's still due). A verified Payment here also gets mirrored into
// Order.payments so the two stay consistent.
const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },

    method: {
      type: String,
      required: true,
      enum: ['cod', 'bkash_manual', 'bkash_automated', 'sslcommerz', 'other'],
    },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BDT' },

    // pending: awaiting collection/gateway (COD, or a just-created automated intent)
    // pending_verification: customer submitted proof, awaiting admin review (manual bKash)
    // verified: confirmed — mirrored into Order.payments
    // failed: rejected by admin, or gateway reported failure
    // refunded: money was returned
    status: {
      type: String,
      enum: ['pending', 'pending_verification', 'verified', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },

    // ----- Manual bKash proof (customer-submitted at checkout) -----
    senderNumber: { type: String, trim: true, default: '' },
    transactionId: { type: String, trim: true, default: '' },
    proofImageUrl: { type: String, trim: true, default: '' },

    // ----- Automated gateway fields (bKash Tokenized Checkout, SSLCommerz, ...) -----
    gatewayReference: { type: String, trim: true, default: '' }, // e.g. bKash paymentID / trxID
    gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null }, // raw response, for debugging/audit

    // ----- Manual verification -----
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' },

    note: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
