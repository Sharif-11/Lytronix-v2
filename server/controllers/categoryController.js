const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const cloudinaryService = require('../services/cloudinary');

// Resolve a :slug param that might actually be an ObjectId (admin links by id,
// storefront links by slug).
async function findBySlugOrId(slugOrId) {
  if (mongoose.isValidObjectId(slugOrId)) {
    const byId = await Category.findById(slugOrId);
    if (byId) return byId;
  }
  return Category.findOne({ slug: slugOrId });
}

// GET /api/categories?flat=true&includeInactive=true
// Default: nested tree of active categories + a flat list (for <select>s).
exports.listCategories = async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const filter = includeInactive ? {} : { isActive: true };

  const [tree, flatRaw] = await Promise.all([
    Category.buildTree({ includeInactive }),
    Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean(),
  ]);

  // Attach a live product count per category (direct + descendants) so the
  // admin tree and storefront facets can show "(12)" without a second call.
  const counts = await Product.aggregate([
    { $unwind: '$categoryPath' },
    { $group: { _id: '$categoryPath', count: { $sum: 1 } } },
  ]);
  const countByCat = new Map(counts.map((c) => [String(c._id), c.count]));

  const decorate = (nodes) =>
    nodes.map((n) => ({
      ...n,
      productCount: countByCat.get(String(n._id)) || 0,
      children: decorate(n.children || []),
    }));

  res.json({
    tree: decorate(tree),
    flat: flatRaw.map((c) => ({ ...c, productCount: countByCat.get(String(c._id)) || 0 })),
  });
};

// GET /api/categories/:slug  -> category + breadcrumb + immediate children
exports.getCategory = async (req, res) => {
  const category = await findBySlugOrId(req.params.slug);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  const [breadcrumb, children] = await Promise.all([
    category.getPath(),
    Category.find({ parent: category._id, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
  ]);

  const productCount = await Product.countDocuments({ categoryPath: category._id });

  res.json({ category: category.toObject(), breadcrumb, children, productCount });
};

const EDITABLE = ['name', 'parent', 'description', 'image', 'isActive', 'sortOrder'];
function pickEditable(body) {
  const out = {};
  EDITABLE.forEach((f) => {
    if (body[f] !== undefined) out[f] = body[f];
  });
  if (out.parent === '' || out.parent === 'null') out.parent = null;
  return out;
}

// POST /api/categories
exports.createCategory = async (req, res) => {
  const data = pickEditable(req.body);
  if (!data.name) return res.status(400).json({ message: 'Category name is required.' });
  const category = await Category.create(data);
  res.status(201).json(category);
};

// PUT /api/categories/:id
exports.updateCategory = async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  const data = pickEditable(req.body);
  const parentChanged =
    data.parent !== undefined && String(data.parent || '') !== String(category.parent || '');
  const previousImage = category.image;

  Object.assign(category, data);
  await category.save(); // pre-save guards against cycles + refreshes slug

  // The image was replaced or removed — clean up the old one in Cloudinary
  // so it doesn't linger as an orphan.
  if (previousImage && previousImage !== category.image) {
    cloudinaryService.destroyByUrl(previousImage).catch(() => {});
  }

  // Re-parenting shifts the ancestor chain for this category and everything
  // beneath it — rebuild categoryPath on all affected products.
  if (parentChanged) {
    await rebuildProductPathsUnder(category._id);
  }

  res.json(category);
};

// DELETE /api/categories/:id?reassignTo=<categoryId>
exports.deleteCategory = async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });

  const childCount = await Category.countDocuments({ parent: category._id });
  if (childCount > 0) {
    return res.status(400).json({
      message: `This category has ${childCount} sub-categor${
        childCount === 1 ? 'y' : 'ies'
      }. Delete or move them first.`,
    });
  }

  const productCount = await Product.countDocuments({ category: category._id });
  if (productCount > 0) {
    const { reassignTo } = req.query;
    if (!reassignTo) {
      return res.status(400).json({
        message: `${productCount} product(s) are in this category. Pass ?reassignTo=<categoryId> (or an empty category) to move them.`,
        productCount,
      });
    }
    const target = reassignTo === 'none' ? null : await Category.findById(reassignTo);
    if (reassignTo !== 'none' && !target) {
      return res.status(400).json({ message: 'The category to reassign products to does not exist.' });
    }
    const affected = await Product.find({ category: category._id }).select('_id');
    await Product.updateMany({ category: category._id }, { category: target ? target._id : null });
    // Recompute paths for the moved products.
    for (const p of affected) {
      // eslint-disable-next-line no-await-in-loop
      const doc = await Product.findById(p._id);
      doc.markModified('category');
      // eslint-disable-next-line no-await-in-loop
      await doc.save();
    }
  }

  await category.deleteOne();

  if (category.image) {
    cloudinaryService.destroyByUrl(category.image).catch(() => {});
  }

  res.json({ message: 'Category deleted' });
};

// PATCH /api/categories/reorder   body: [{ id, sortOrder, parent }]
exports.reorderCategories = async (req, res) => {
  const updates = Array.isArray(req.body) ? req.body : req.body.updates;
  if (!Array.isArray(updates)) {
    return res.status(400).json({ message: 'Expected an array of { id, sortOrder, parent }.' });
  }

  const reparented = [];
  for (const u of updates) {
    if (!u.id) continue;
    // eslint-disable-next-line no-await-in-loop
    const cat = await Category.findById(u.id);
    if (!cat) continue;
    if (u.sortOrder !== undefined) cat.sortOrder = u.sortOrder;
    if (u.parent !== undefined) {
      const nextParent = u.parent === null || u.parent === '' || u.parent === 'null' ? null : u.parent;
      if (String(nextParent || '') !== String(cat.parent || '')) reparented.push(cat._id);
      cat.parent = nextParent;
    }
    // eslint-disable-next-line no-await-in-loop
    await cat.save();
  }

  for (const id of reparented) {
    // eslint-disable-next-line no-await-in-loop
    await rebuildProductPathsUnder(id);
  }

  res.json({ message: 'Categories reordered' });
};

// Rebuilds Product.categoryPath for every product whose category is `rootId`
// or any descendant of it. Called after a re-parent.
async function rebuildProductPathsUnder(rootId) {
  const descendantIds = await collectDescendantIds(rootId);
  const all = [rootId, ...descendantIds];
  const products = await Product.find({ category: { $in: all } });
  for (const p of products) {
    p.markModified('category'); // force the syncCategoryPath pre-save hook to run
    // eslint-disable-next-line no-await-in-loop
    await p.save();
  }
}

async function collectDescendantIds(rootId) {
  const out = [];
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift();
    // eslint-disable-next-line no-await-in-loop
    const children = await Category.find({ parent: current }).select('_id').lean();
    children.forEach((c) => {
      out.push(c._id);
      queue.push(c._id);
    });
  }
  return out;
}

exports._internal = { rebuildProductPathsUnder, collectDescendantIds, findBySlugOrId };
