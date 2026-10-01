const mongoose = require('mongoose');

// Singleton: which automatic SMS events are switched on. An admin flips
// these; everything defaults to on so nothing changes until then. Only
// non-critical, "nice to have" notifications are toggleable here — OTP,
// password resets and admin-manual messages always send regardless.
const SINGLETON_ID = 'sms-settings';
const EVENTS = ['admin_new_order', 'customer_consignment_booked', 'customer_delivered'];

const smsSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    admin_new_order: { type: Boolean, default: true },
    customer_consignment_booked: { type: Boolean, default: true },
    customer_delivered: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

smsSettingsSchema.statics.SINGLETON_ID = SINGLETON_ID;
smsSettingsSchema.statics.EVENTS = EVENTS;

smsSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });
  return doc;
};

module.exports = mongoose.model('SmsSettings', smsSettingsSchema);
