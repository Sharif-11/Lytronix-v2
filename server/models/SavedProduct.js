const mongoose = require('mongoose');

// A customer's saved / wishlisted product. One row per (customer, product).
const savedProductSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerAccount',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
  },
  { timestamps: true }
);

savedProductSchema.index({ customer: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('SavedProduct', savedProductSchema);
