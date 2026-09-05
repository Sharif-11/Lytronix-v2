const mongoose = require('mongoose');

// A persistent per-customer cart. Only the product ref + quantity are stored;
// name / price / image / delivery charge are hydrated live from the Product on
// read, so catalogue changes flow straight through to an open cart. Guests use
// a localStorage cart on the client and merge it here on login.
const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerAccount',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

// Returns the cart as line items the storefront can render directly, dropping
// any items whose product has since been deleted or deactivated.
cartSchema.methods.hydrate = async function hydrate() {
  await this.populate('items.product');
  return this.items
    .filter((i) => i.product && i.product.isActive)
    .map((i) => {
      const p = i.product;
      const maxQty = p.trackInventory ? p.stock : Infinity;
      const quantity = Math.max(1, Math.min(i.quantity, maxQty === Infinity ? i.quantity : maxQty));
      return {
        productId: String(p._id),
        slug: p.slug,
        name: p.name,
        description: p.description || '',
        unitPrice: p.price,
        deliveryCharge: p.deliveryCharge || 0,
        imageUrl: p.imageUrl || '',
        stock: p.trackInventory ? p.stock : null,
        trackInventory: p.trackInventory,
        paymentPolicy: p.paymentPolicy,
        quantity,
        outOfStock: p.trackInventory && p.stock <= 0,
      };
    });
};

module.exports = mongoose.model('Cart', cartSchema);
