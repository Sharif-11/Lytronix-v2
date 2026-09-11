const mongoose = require('mongoose');

// Singleton settings doc for the chat auto-reply assistant. One row, fixed
// _id, upserted — simpler than a dedicated Settings collection for a single
// on/off switch + one text blob, and admin-editable without a redeploy.
const SINGLETON_ID = 'chat-ai-settings';

const chatAiSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    // Master switch — auto-reply is opt-in, off until an admin turns it on.
    enabled: { type: Boolean, default: false },
    // Free-text knowledge base for questions the product catalogue alone
    // can't answer (e.g. "we don't stock that configuration, but X is a
    // close substitute"). Kept small and deliberately not rich text — this
    // is prompt input, not a page anyone renders.
    knowledgeBase: { type: String, trim: true, default: '', maxlength: 20000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

chatAiSettingsSchema.statics.SINGLETON_ID = SINGLETON_ID;

chatAiSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });
  return doc;
};

module.exports = mongoose.model('ChatAiSettings', chatAiSettingsSchema);
