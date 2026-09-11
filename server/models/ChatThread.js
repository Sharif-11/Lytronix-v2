const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');

// A guest key so a not-logged-in visitor can only read/write their own
// thread (the phone number alone isn't a secret). Handed to the widget on
// /chat/start and kept in the browser's localStorage.
const makeKey = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 32);

// One live-chat conversation per phone number, OR per Facebook Messenger
// user (see channel/messengerPsid below) — kept as one collection since the
// admin inbox, message history, AI auto-reply, and typing indicators all
// work identically regardless of channel; only how a reply gets delivered
// differs (WebPush vs the Messenger Send API — see chatAi.js/chatController.js).
//
// Messenger has no phone number at all (Facebook hands you a Page-Scoped
// User ID, not a phone) and deliberately never gets linked to a storefront
// thread for the same real person — Facebook gives no way to do that
// reliably, and a customer messaging on two channels is legitimately two
// separate conversations from an admin's point of view. To avoid threading
// "channel + identifier" through every phone-keyed route/query/index in
// this file, a Messenger thread's `phone` holds a synthetic, never-dialable
// value (`msgr:<PSID>`) instead — everything that already keys off `phone`
// (routes, ChatMessage.phone, uniqueness) keeps working unchanged.
const chatThreadSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    name: { type: String, trim: true, default: '' },
    guestKey: { type: String, default: () => makeKey() },
    customerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerAccount', default: null },

    channel: { type: String, enum: ['default', 'messenger'], default: 'default', index: true },
    // Only set for channel:'messenger' — the real identifier used to call
    // the Send API and to find this thread again on the next webhook event.
    messengerPsid: { type: String, default: '', index: true, sparse: true },

    // Auto-reply's per-thread daily budget (see chatAi.js) — resets when
    // aiRepliesDate rolls over to a new day (server-local "YYYY-MM-DD").
    // Counts every attempted Gemini call, not just ones that got posted,
    // since a declined/errored attempt still costs the same API call.
    aiRepliesToday: { type: Number, default: 0 },
    aiRepliesDate: { type: String, default: '' },

    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, trim: true, default: '' },
    lastMessageFrom: { type: String, enum: ['customer', 'admin', ''], default: '' },

    unreadForAdmin: { type: Number, default: 0 },
    unreadForCustomer: { type: Number, default: 0 },

    // Last time each side pinged "I'm typing" (see chatController's
    // customerTyping/adminTyping). Read as "currently typing" only while
    // recent — see TYPING_TTL_MS — so a side that stopped typing without
    // sending anything doesn't show as typing forever.
    customerTypingAt: { type: Date, default: null },
    adminTypingAt: { type: Date, default: null },

    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatThread', chatThreadSchema);
