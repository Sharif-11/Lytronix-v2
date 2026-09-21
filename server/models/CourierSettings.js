const mongoose = require('mongoose');

// Singleton: the pickup details the admin would otherwise retype for every
// pickup request. One row, fixed _id — same pattern as the other settings.
const SINGLETON_ID = 'courier-settings';

const courierSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    pickup: {
      addressId: { type: Number, default: null }, // from the "Pickup Addresses" page in the Steadfast portal
      policeStationId: { type: Number, default: null },
      districtName: { type: String, trim: true, default: '' },
      policeStationName: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '', maxlength: 255 },
      contactNumber: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

courierSettingsSchema.statics.load = async function load() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) doc = await this.create({ _id: SINGLETON_ID });
  return doc;
};

module.exports = mongoose.model('CourierSettings', courierSettingsSchema);
