const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// A storefront customer login. Phone is the identity; sign-in is either a
// one-time OTP or an optional password the customer sets to skip OTP on
// future logins. Sessions are a short access token + a long refresh token;
// bumping `tokenVersion` invalidates every issued token (used on password
// change / reset / block). Deliberately separate from the admin-side
// `Customer` rolodex model — linked by phone number.
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: 'Home' }, // "Home", "Office", ...
    name: { type: String, trim: true, default: '' }, // recipient, if different
    phone: { type: String, trim: true, default: '' }, // contact for this address, if different
    zilla: { type: String, trim: true, default: '' }, // district
    policeStation: { type: String, trim: true, default: '' }, // thana
    address: { type: String, trim: true, default: '' }, // house, road, area
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const customerAccountSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      unique: true,
    },
    phoneVerified: { type: Boolean, default: false },
    name: { type: String, trim: true, default: '' },
    addresses: { type: [addressSchema], default: [] },

    // Optional password so the customer can log in without an OTP each time.
    // `tempPassword` marks an auto-generated one (guest-checkout / forgot
    // password) so the UI can nudge them to pick their own.
    passwordHash: { type: String, default: '', select: false },
    tempPassword: { type: Boolean, default: false },

    // Bump to invalidate every access/refresh token already issued.
    tokenVersion: { type: Number, default: 0 },

    // forgot-password throttle (SMS costs money)
    lastPasswordResetAt: { type: Date, default: null },
    passwordResetCount: { type: Number, default: 0 },
    passwordResetWindowStartedAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

customerAccountSchema.virtual('profileComplete').get(function profileCompleteVirtual() {
  return Boolean(this.name && this.addresses && this.addresses.length > 0);
});

customerAccountSchema.virtual('hasPassword').get(function hasPasswordVirtual() {
  return Boolean(this.passwordHash);
});

// A 6-digit numeric password, first digit never 0 — used for the
// auto-generated guest-checkout and forgot-password passwords.
customerAccountSchema.statics.generateNumericPassword = function generateNumericPassword() {
  const first = 1 + Math.floor(Math.random() * 9);
  let rest = '';
  for (let i = 0; i < 5; i += 1) rest += Math.floor(Math.random() * 10);
  return `${first}${rest}`;
};

customerAccountSchema.methods.setPassword = async function setPassword(plain, { temp = false } = {}) {
  this.passwordHash = await bcrypt.hash(String(plain), 10);
  this.tempPassword = temp;
};

customerAccountSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(String(plain), this.passwordHash);
};

customerAccountSchema.virtual('defaultAddress').get(function defaultAddressVirtual() {
  if (!this.addresses || this.addresses.length === 0) return null;
  return this.addresses.find((a) => a.isDefault) || this.addresses[0];
});

customerAccountSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    phone: this.phone,
    phoneVerified: this.phoneVerified,
    name: this.name,
    addresses: this.addresses,
    profileComplete: this.profileComplete,
    defaultAddress: this.defaultAddress,
    hasPassword: this.hasPassword,
    tempPassword: this.tempPassword,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

// Ensure at most one default address; if none is flagged, promote the first.
customerAccountSchema.pre('save', function normaliseDefaultAddress(next) {
  if (!this.addresses || this.addresses.length === 0) return next();
  const flagged = this.addresses.filter((a) => a.isDefault);
  if (flagged.length === 0) {
    this.addresses[0].isDefault = true;
  } else if (flagged.length > 1) {
    let kept = false;
    this.addresses.forEach((a) => {
      if (a.isDefault && kept) a.isDefault = false;
      else if (a.isDefault) kept = true;
    });
  }
  next();
});

module.exports = mongoose.model('CustomerAccount', customerAccountSchema);
