const mongoose = require('mongoose');

// Singleton: which payment methods customers may choose at checkout. A super
// admin flips these; everything defaults to on so nothing changes until then.
const SINGLETON_ID = 'payment-settings';
const METHODS = ['cod', 'bkash_manual', 'bkash_automated', 'bank_transfer'];

const paymentSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    cod: { type: Boolean, default: true },
    bkash_manual: { type: Boolean, default: true },
    bkash_automated: { type: Boolean, default: true },
    bank_transfer: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

paymentSettingsSchema.statics.SINGLETON_ID = SINGLETON_ID;
paymentSettingsSchema.statics.METHODS = METHODS;

paymentSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });
  return doc;
};

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);
