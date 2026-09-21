const mongoose = require('mongoose');

// Singleton for the SMS listener. Only holds the "test mode" switch: while it is
// on, a message from ANY sender that looks like a bKash receipt is parsed and
// shown in the log, but never used to verify a payment. It expires by itself,
// so it cannot be left on by accident.
const SINGLETON_ID = 'sms-listener-settings';

const smsListenerSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    testUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

smsListenerSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });
  return doc;
};

smsListenerSettingsSchema.statics.isTestMode = async function isTestMode() {
  const doc = await this.load();
  return Boolean(doc.testUntil && doc.testUntil.getTime() > Date.now());
};

module.exports = mongoose.model('SmsListenerSettings', smsListenerSettingsSchema);
