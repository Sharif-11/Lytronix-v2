const mongoose = require('mongoose');

// A storefront customer login. Phone-only auth (OTP) — no password. This is
// deliberately separate from the admin-side `Customer` rolodex model: this one
// is owned by the customer, that one is an internal notebook. They're linked
// by phone number (the order controller upserts the rolodex on checkout).
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

    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

customerAccountSchema.virtual('profileComplete').get(function profileCompleteVirtual() {
  return Boolean(this.name && this.addresses && this.addresses.length > 0);
});

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
