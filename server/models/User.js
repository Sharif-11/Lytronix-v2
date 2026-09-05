const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    // Optional: when set it must be unique, but many staff accounts may have
    // none at all (phone is the mandatory identifier — see below), hence the
    // *sparse* unique index rather than a plain one.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
    },
    // The one mandatory identifier for every admin account, including the
    // seeded superadmin — used for login (alongside email, if set) and as
    // the destination for the "forgot password" SMS.
    phone: { type: String, required: [true, 'Phone number is required'], trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

    // Set true right after a "forgot password" reset; cleared on the next
    // successful change-password. Drives a nag banner in the admin UI.
    mustChangePassword: { type: Boolean, default: false },
    // Throttle gate for POST /api/auth/forgot-password (mirrors the OTP
    // rate-limit pattern in customerAuthController.js).
    lastPasswordResetAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });

userSchema.methods.setPassword = async function setPassword(plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, 10);
};

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email || '',
    phone: this.phone,
    role: this.role,
    isActive: this.isActive,
    mustChangePassword: this.mustChangePassword,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
