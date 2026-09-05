const mongoose = require('mongoose');

const smsLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    purpose: {
      type: String,
      required: true,
      enum: [
        'admin_new_order',
        'customer_consignment_booked',
        'customer_delivered',
        'customer_otp',
        'customer_account_created',
        'customer_password_reset',
        'admin_password_reset',
        'marketing',
        'admin_manual',
        'other',
      ],
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    responseCode: { type: Number, default: null },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

smsLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SmsLog', smsLogSchema);
