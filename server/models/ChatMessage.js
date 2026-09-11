const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatThread', required: true, index: true },
    phone: { type: String, required: true, trim: true, index: true }, // denormalised for fast per-phone queries
    from: { type: String, enum: ['customer', 'admin'], required: true },
    senderName: { type: String, trim: true, default: '' },
    // Set on messages the chat AI assistant auto-posted (from:'admin' still —
    // it speaks as the shop) so the admin inbox can visibly flag them apart
    // from a human reply and jump in if the answer needs correcting.
    isAiReply: { type: Boolean, default: false },

    type: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
    body: { type: String, trim: true, default: '', maxlength: 4000 }, // caption / text
    mediaUrl: { type: String, trim: true, default: '' }, // Cloudinary URL for image/voice
    mediaMime: { type: String, trim: true, default: '' },
    durationSec: { type: Number, default: 0 }, // voice length

    // WhatsApp-style receipts. "delivered" = the other side's client has
    // pulled the message; "read" = they actually had the conversation open.
    deliveredToAdmin: { type: Boolean, default: false },
    deliveredToCustomer: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: false },
    readByCustomer: { type: Boolean, default: false },

    editedAt: { type: Date },
    deletedAt: { type: Date }, // soft delete — the row stays as a tombstone
  },
  { timestamps: true }
);

// A message must carry either text or media — unless it's a deleted tombstone.
chatMessageSchema.pre('validate', function requireContent(next) {
  if (this.deletedAt) return next();
  if (!String(this.body || '').trim() && !this.mediaUrl) {
    return next(new Error('A chat message needs text or an attachment.'));
  }
  next();
});

chatMessageSchema.index({ thread: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
