const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatThread', required: true, index: true },
    phone: { type: String, required: true, trim: true, index: true }, // denormalised for fast per-phone queries
    from: { type: String, enum: ['customer', 'admin'], required: true },
    senderName: { type: String, trim: true, default: '' },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    readByAdmin: { type: Boolean, default: false },
    readByCustomer: { type: Boolean, default: false },
  },
  { timestamps: true }
);

chatMessageSchema.index({ thread: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
