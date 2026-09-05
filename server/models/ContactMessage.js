const mongoose = require('mongoose');

// A message sent from the storefront's Contact page. Persisted so the admin
// has a real inbox (the notification-bell entry is just a heads-up and
// self-expires). `contact` is whatever the visitor typed — a phone number
// or an email — kept verbatim.
const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    contact: { type: String, trim: true, required: true }, // phone or email, as entered
    email: { type: String, trim: true, default: '' }, // filled when `contact` looks like an email
    phone: { type: String, trim: true, default: '' }, // filled when `contact` looks like a BD phone
    message: { type: String, trim: true, required: true },

    status: { type: String, enum: ['new', 'read', 'archived'], default: 'new', index: true },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
