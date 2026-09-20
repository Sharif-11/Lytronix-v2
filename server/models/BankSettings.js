const mongoose = require('mongoose');

// Singleton: the merchant's bank account that customers pay into when they
// choose "bank transfer" at checkout. Editable by a super admin only. One
// row with a fixed _id, upserted — same pattern as ChatAiSettings.
const SINGLETON_ID = 'bank-settings';

const field = { type: String, trim: true, default: '', maxlength: 200 };

const bankSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    bankName: field,
    accountName: field,
    accountNumber: field,
    district: field,
    branchName: field,
    routingNumber: field,
    swiftCode: field,
    instructions: { type: String, trim: true, default: '', maxlength: 1000 }, // free-text note shown to the customer
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

bankSettingsSchema.statics.SINGLETON_ID = SINGLETON_ID;

bankSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });
  return doc;
};

// A bank transfer can only be offered once the essentials are filled in.
bankSettingsSchema.methods.isConfigured = function isConfigured() {
  return Boolean(this.bankName && this.accountName && this.accountNumber);
};

const PUBLIC_FIELDS = ['bankName', 'accountName', 'accountNumber', 'district', 'branchName', 'routingNumber', 'swiftCode', 'instructions'];

// What the storefront may see.
bankSettingsSchema.methods.toPublic = function toPublic() {
  const out = { configured: this.isConfigured() };
  PUBLIC_FIELDS.forEach((k) => {
    out[k] = this[k] || '';
  });
  return out;
};

bankSettingsSchema.statics.PUBLIC_FIELDS = PUBLIC_FIELDS;

module.exports = mongoose.model('BankSettings', bankSettingsSchema);
