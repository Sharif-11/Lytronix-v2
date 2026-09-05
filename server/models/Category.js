const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
const slugify = require('../utils/slugify');

const randomSuffix = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 6);

/**
 * A catalogue category. Categories form a tree via `parent` (self-reference).
 * The tree can nest arbitrarily deep, though the admin UI is built around two
 * visible levels (category -> sub-category).
 *
 * Products point at exactly one category (leaf or not). `Product.categoryPath`
 * denormalises the ancestor chain so "everything under category X, including
 * its sub-categories" is a single `{ categoryPath: X }` query.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Category name is required'], trim: true },
    slug: { type: String, trim: true, lowercase: true, unique: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    description: { type: String, trim: true, default: '' },
    image: { type: String, trim: true, default: '' }, // Cloudinary URL
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

categorySchema.index({ parent: 1, sortOrder: 1, name: 1 });

// Generate a slug from the name on create, and whenever the name changes.
// Bangla / non-latin names slug to '' — fall back to a short random token so
// the unique index is still satisfied and the URL is still routable.
categorySchema.pre('validate', async function generateSlug(next) {
  if (this.slug && !this.isModified('name')) return next();

  let base = slugify(this.name);
  if (!base) base = `category-${randomSuffix()}`;

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

// Reject a parent that would create a cycle (self, or one of our descendants).
categorySchema.pre('save', async function guardCycle(next) {
  if (!this.parent) return next();
  if (String(this.parent) === String(this._id)) {
    return next(new Error('A category cannot be its own parent.'));
  }
  let ancestorId = this.parent;
  const seen = new Set([String(this._id)]);
  while (ancestorId) {
    if (seen.has(String(ancestorId))) {
      return next(new Error('That parent would create a loop in the category tree.'));
    }
    seen.add(String(ancestorId));
    // eslint-disable-next-line no-await-in-loop
    const ancestor = await this.constructor.findById(ancestorId).select('parent').lean();
    if (!ancestor) break;
    ancestorId = ancestor.parent;
  }
  next();
});

// Returns [rootAncestor, ..., self] as lean docs (ids + name + slug).
categorySchema.methods.getPath = async function getPath() {
  const path = [];
  let node = this;
  const seen = new Set();
  while (node) {
    if (seen.has(String(node._id))) break;
    seen.add(String(node._id));
    path.unshift({ _id: node._id, name: node.name, slug: node.slug });
    // eslint-disable-next-line no-await-in-loop
    node = node.parent ? await this.constructor.findById(node.parent).select('name slug parent') : null;
  }
  return path;
};

// Builds a nested tree of active categories: [{...cat, children: [...] }].
categorySchema.statics.buildTree = async function buildTree({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  const all = await this.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  const byParent = new Map();
  all.forEach((c) => {
    const key = c.parent ? String(c.parent) : 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  });
  const attach = (key) =>
    (byParent.get(key) || []).map((c) => ({ ...c, children: attach(String(c._id)) }));
  return attach('root');
};

module.exports = mongoose.model('Category', categorySchema);
