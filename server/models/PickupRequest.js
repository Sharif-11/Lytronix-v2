const mongoose = require('mongoose');

// One row per pickup request we sent to Steadfast. Steadfast has no endpoint to
// list them, so this is the only history the admin panel can show.
const pickupRequestSchema = new mongoose.Schema(
  {
    addressId: { type: Number, required: true },
    policeStationId: { type: Number, required: true },
    address: { type: String, trim: true, default: '' },
    contactNumber: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    estimatedQty: { type: Number, default: null },
    steadfastId: { type: Number, default: null }, // id in Steadfast's reply
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

pickupRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PickupRequest', pickupRequestSchema);
