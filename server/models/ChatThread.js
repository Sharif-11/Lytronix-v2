const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');

// A guest key so a not-logged-in visitor can only read/write their own
// thread (the phone number alone isn't a secret). Handed to the widget on
// /chat/start and kept in the browser's localStorage.
const makeKey = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 32);

// One live-chat conversation per phone number. Admin ↔ customer, grouped by
// phone (guest or logged-in alike).
const chatThreadSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    name: { type: String, trim: true, default: '' },
    guestKey: { type: String, default: () => makeKey() },
    customerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerAccount', default: null },

    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, trim: true, default: '' },
    lastMessageFrom: { type: String, enum: ['customer', 'admin', ''], default: '' },

    unreadForAdmin: { type: Number, default: 0 },
    unreadForCustomer: { type: Number, default: 0 },

    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatThread', chatThreadSchema);
