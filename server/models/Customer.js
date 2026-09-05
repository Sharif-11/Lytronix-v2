const mongoose = require('mongoose');

const CHANNELS = ['messenger', 'whatsapp', 'instagram', 'facebook', 'phone', 'sms', 'other'];
const PRIORITIES = ['low', 'medium', 'high'];

/**
 * Customer notebook entry.
 * A lightweight rolodex for future reference — not linked to orders.
 * Only phone is required; everything else is optional context so the
 * admin can jot down whatever they know about the customer.
 */
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, required: [true, 'Phone number is required'], trim: true },
    zilla: { type: String, trim: true, default: '' }, // district
    thana: { type: String, trim: true, default: '' }, // sub-district / police station
    address: { type: String, trim: true, default: '' },
    comments: { type: String, trim: true, default: '' }, // may contain simple HTML from the rich text editor

    // How the customer is usually reached / contacted.
    channels: {
      type: [{ type: String, enum: CHANNELS }],
      default: [],
    },

    // Follow-up priority.
    priority: { type: String, enum: PRIORITIES, default: 'medium' },

    // Freeform tags — used for customer potentiality/type (e.g. "Future
    // customer", "Paikari (wholesale)", "Khuchra (retail)") as well as any
    // other manual label the admin wants to jot down.
    tags: {
      type: [{ type: String, trim: true }],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
module.exports.CHANNELS = CHANNELS;
module.exports.PRIORITIES = PRIORITIES;

