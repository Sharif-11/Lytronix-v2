const mongoose = require('mongoose');

// Singleton: the merchant's mobile-wallet numbers (bKash / Nagad / Rocket) that
// customers send money to. Any number of accounts per wallet can be saved, but
// exactly one per wallet is "active" — the only one customers are shown.
// Editable by a super admin only. Same singleton pattern as BankSettings.
const SINGLETON_ID = 'wallet-settings';
const PROVIDERS = ['bkash', 'nagad', 'rocket'];
const ACCOUNT_TYPES = ['personal', 'agent', 'merchant'];
// Wallets that have an automated gateway, and the credential fields each needs.
const CREDENTIAL_FIELDS = { bkash: ['appKey', 'appSecret', 'username', 'password'] };
const BD_MOBILE = /^01[3-9]\d{8}$/;

const walletAccountSchema = new mongoose.Schema({
  provider: { type: String, enum: PROVIDERS, required: true },
  number: { type: String, trim: true, required: true },
  accountName: { type: String, trim: true, default: '', maxlength: 100 },
  accountType: { type: String, enum: ACCOUNT_TYPES, default: 'personal' },
  instructions: { type: String, trim: true, default: '', maxlength: 500 },
  // Shown to customers for manual "send money" payments (one per wallet).
  isActive: { type: Boolean, default: false },
  // RECEIVES AUTOMATED (gateway) PAYMENTS (one per wallet). The gateway pays into whichever
  // merchant account the API credentials belong to, so this needs credentials.
  autoActive: { type: Boolean, default: false },
  credentialsEnc: { type: String, default: '' }, // AES-GCM of the gateway credentials — never sent to a client
  sandbox: { type: Boolean, default: false }, // gateway test environment instead of live
});

const walletSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    accounts: { type: [walletAccountSchema], default: [] },
    // A whole wallet can be switched off: customers then see no number for it.
    enabled: {
      bkash: { type: Boolean, default: true },
      nagad: { type: Boolean, default: true },
      rocket: { type: Boolean, default: true },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

walletSettingsSchema.statics.SINGLETON_ID = SINGLETON_ID;
walletSettingsSchema.statics.PROVIDERS = PROVIDERS;
walletSettingsSchema.statics.ACCOUNT_TYPES = ACCOUNT_TYPES;
walletSettingsSchema.statics.BD_MOBILE = BD_MOBILE;
walletSettingsSchema.statics.CREDENTIAL_FIELDS = CREDENTIAL_FIELDS;

walletSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });
  return doc;
};

// Enforce "one active per wallet": if several are flagged active the first wins.
// Nothing is auto-activated — a wallet with no active account shows no number.
walletSettingsSchema.methods.enforceOneActive = function enforceOneActive() {
  PROVIDERS.forEach((p) => {
    const winner = this.accounts.find((a) => a.provider === p && a.isActive);
    this.accounts.forEach((a) => {
      if (a.provider === p) a.isActive = a === winner;
    });
    // Same rule for the automated-payments account, which must also have credentials.
    const auto = this.accounts.find((a) => a.provider === p && a.autoActive && a.credentialsEnc);
    this.accounts.forEach((a) => {
      if (a.provider === p) a.autoActive = a === auto;
    });
  });
};

const shape = (a) => ({
  _id: String(a._id),
  provider: a.provider,
  number: a.number,
  accountName: a.accountName || '',
  accountType: a.accountType,
  instructions: a.instructions || '',
  isActive: Boolean(a.isActive),
  autoActive: Boolean(a.autoActive),
  hasCredentials: Boolean(a.credentialsEnc),
  sandbox: Boolean(a.sandbox),
});

walletSettingsSchema.methods.enabledMap = function enabledMap() {
  return Object.fromEntries(PROVIDERS.map((p) => [p, this.enabled?.[p] !== false]));
};

// What the storefront may see: ONLY the active account of each wallet.
walletSettingsSchema.methods.toPublic = function toPublic() {
  const out = {};
  PROVIDERS.forEach((p) => {
    const a = this.enabled?.[p] === false ? null : this.accounts.find((x) => x.provider === p && x.isActive);
    out[p] = a ? shape(a) : null;
  });
  return out;
};

// What the super admin edits: every account, active flag included.
walletSettingsSchema.methods.toAdmin = function toAdmin() {
  return { accounts: this.accounts.map(shape), enabled: this.enabledMap() };
};

// Human label for a saved account, used on payment records.
walletSettingsSchema.methods.labelFor = function labelFor(accountId) {
  const a = this.accounts.find((x) => String(x._id) === String(accountId));
  return a ? `${a.provider} · ${a.number}` : '';
};

module.exports = mongoose.model('WalletSettings', walletSettingsSchema);
