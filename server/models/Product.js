const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
const slugify = require('../utils/slugify');

const randomSuffix = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 6);

/**
 * Product catalogue entry.
 * Order items store their own copy of name/price/description/deliveryCharge,
 * so editing a product here does NOT retroactively change past orders.
 */
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    slug: { type: String, trim: true, lowercase: true, unique: true },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    sku: {
      type: String,
      trim: true,
      default: '',
    },

    // The category this product sits in (a leaf sub-category, or any node).
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    // Denormalised ancestor chain (root ... category). Lets the storefront
    // filter "everything under this category incl. sub-categories" with a
    // single `{ categoryPath: X }` query. Maintained by the pre-save hook
    // below and by the category controller when the tree is re-parented.
    categoryPath: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      default: [],
      index: true,
    },

    // Cloudinary image URLs, in display order. images[0] is the cover photo.
    images: {
      type: [String],
      default: [],
    },
    // Cloudinary video URLs (product demo/unboxing clips etc.), separate
    // from the photo gallery.
    videos: {
      type: [String],
      default: [],
    },

    // ----- Inventory -----
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Some items (services, made-to-order, etc.) shouldn't ever block
    // checkout on stock — switch this off to treat them as unlimited.
    trackInventory: {
      type: Boolean,
      default: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0,
    },

    // ----- Analytics counters (fast reads for "most viewed / most ordered").
    // AnalyticsEvent keeps the per-day history; these are running totals. -----
    viewCount: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 }, // total units ordered

    // ----- Per-product payment policy -----
    // Not every product can safely be sold on pure Cash on Delivery (courier
    // refusal risk, high value, made-to-order, etc). Admin sets this per
    // product; the storefront checkout enforces it (see
    // server/utils/paymentPolicy.js), and shows it to the customer before
    // they add the item to cart.
    //   codAllowed: false            -> full advance required, no COD leg at all
    //   advanceType 'fixed'          -> advanceAmount taka per unit up front, rest COD
    //   advanceType 'percent'        -> advancePercent% of the line total up front, rest COD
    //   advanceType 'none' (default) -> full COD, nothing up front
    paymentPolicy: {
      codAllowed: { type: Boolean, default: true },
      advanceType: { type: String, enum: ['none', 'fixed', 'percent'], default: 'none' },
      advanceAmount: { type: Number, default: 0, min: 0 }, // taka per unit, used when advanceType = 'fixed'
      advancePercent: { type: Number, default: 0, min: 0, max: 100 }, // used when advanceType = 'percent'
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Kept so existing code that reads `product.imageUrl` (storefront cards,
// cart line items, etc.) doesn't need to change — it's just the cover photo.
productSchema.virtual('imageUrl').get(function imageUrlVirtual() {
  return this.images && this.images.length ? this.images[0] : '';
});

productSchema.virtual('inStock').get(function inStockVirtual() {
  return !this.trackInventory || this.stock > 0;
});

productSchema.virtual('lowStock').get(function lowStockVirtual() {
  return this.trackInventory && this.stock > 0 && this.stock <= this.lowStockThreshold;
});

productSchema.index({ name: 'text', sku: 'text' });

// Slug from name (create + rename). Non-latin names fall back to a token.
productSchema.pre('validate', async function generateSlug(next) {
  if (this.slug && !this.isModified('name')) return next();
  let base = slugify(this.name);
  if (!base) base = `product-${randomSuffix()}`;
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await this.constructor.exists({ slug: candidate, _id: { $ne: this._id } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  this.slug = candidate;
  next();
});

// Keep categoryPath in sync whenever the category changes.
productSchema.pre('save', async function syncCategoryPath(next) {
  if (!this.isModified('category')) return next();
  if (!this.category) {
    this.categoryPath = [];
    return next();
  }
  try {
    const Category = mongoose.model('Category');
    const path = [];
    let nodeId = this.category;
    const seen = new Set();
    while (nodeId && !seen.has(String(nodeId))) {
      seen.add(String(nodeId));
      // eslint-disable-next-line no-await-in-loop
      const node = await Category.findById(nodeId).select('parent').lean();
      if (!node) break;
      path.unshift(nodeId);
      nodeId = node.parent;
    }
    this.categoryPath = path;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Product', productSchema);
