const mongoose = require('mongoose');

// Singleton: the merchant's bank accounts that customers pay into when they
// choose "bank transfer" at checkout. Editable by a super admin only. One
// row with a fixed _id, upserted — same pattern as ChatAiSettings.
const SINGLETON_ID = 'bank-settings';

const field = { type: String, trim: true, default: '', maxlength: 200 };

const ACCOUNT_FIELDS = ['bankName', 'accountName', 'accountNumber', 'district', 'branchName', 'routingNumber', 'swiftCode', 'instructions'];

const accountSchema = new mongoose.Schema({
  bankName: field,
  accountName: field,
  accountNumber: field,
  district: field,
  branchName: field,
  routingNumber: field,
  swiftCode: field,
  instructions: { type: String, trim: true, default: '', maxlength: 1000 }, // free-text note shown to the customer
});

const bankSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    accounts: { type: [accountSchema], default: [] },
    // Legacy single-account fields (before multiple accounts were supported);
    // moved into `accounts` the first time the settings are loaded.
    bankName: field,
    accountName: field,
    accountNumber: field,
    district: field,
    branchName: field,
    routingNumber: field,
    swiftCode: field,
    instructions: { type: String, trim: true, default: '', maxlength: 1000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

bankSettingsSchema.statics.SINGLETON_ID = SINGLETON_ID;
bankSettingsSchema.statics.ACCOUNT_FIELDS = ACCOUNT_FIELDS;

bankSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });

  // One-time migration of the old single-account fields.
  if (doc.accounts.length === 0 && (doc.bankName || doc.accountName || doc.accountNumber)) {
    const legacy = {};
    ACCOUNT_FIELDS.forEach((k) => {
      legacy[k] = doc[k] || '';
      doc[k] = '';
    });
    doc.accounts.push(legacy);
    await doc.save();
  }
  return doc;
};

// An account can only be offered once the essentials are filled in.
const isComplete = (a) => Boolean(a.bankName && a.accountName && a.accountNumber);

bankSettingsSchema.methods.completeAccounts = function completeAccounts() {
  return this.accounts.filter(isComplete);
};

bankSettingsSchema.methods.isConfigured = function isConfigured() {
  return this.completeAccounts().length > 0;
};

const shape = (a) => {
  const out = { _id: String(a._id) };
  ACCOUNT_FIELDS.forEach((k) => {
    out[k] = a[k] || '';
  });
  return out;
};

// What the storefront may see: only usable accounts.
bankSettingsSchema.methods.toPublic = function toPublic() {
  const accounts = this.completeAccounts().map(shape);
  return { configured: accounts.length > 0, accounts };
};

// What the super admin edits: every account, complete or not.
bankSettingsSchema.methods.toAdmin = function toAdmin() {
  return { configured: this.isConfigured(), accounts: this.accounts.map(shape) };
};

// Human label for a saved account, used on payment records.
bankSettingsSchema.methods.labelFor = function labelFor(accountId) {
  const a = this.accounts.find((x) => String(x._id) === String(accountId));
  return a ? `${a.bankName} · ${a.accountNumber}` : '';
};

module.exports = mongoose.model('BankSettings', bankSettingsSchema);
