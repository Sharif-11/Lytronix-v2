const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const analytics = require('../services/analytics');
const cloudinaryService = require('../services/cloudinary');

// Destroys every Cloudinary asset in `urls` that isn't in `keep`. Best-effort
// and fire-and-forget — a Cloudinary hiccup should never block a product
// save/delete from completing.
function destroyRemoved(previousUrls = [], nextUrls = []) {
  const keep = new Set(nextUrls);
  const removed = previousUrls.filter((u) => u && !keep.has(u));
  Promise.all(removed.map((u) => cloudinaryService.destroyByUrl(u))).catch(() => {});
}

async function resolveCategoryId(slugOrId) {
  if (!slugOrId) return null;
  if (mongoose.isValidObjectId(slugOrId)) return slugOrId;
  const cat = await Category.findOne({ slug: slugOrId }).select('_id').lean();
  return cat ? cat._id : null;
}

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  name_asc: { name: 1 },
  popular: { orderCount: -1, viewCount: -1 },
};

// GET /api/products
//   ?search= &active=true|false &category=<slug|id> (incl. sub-categories)
//   &minPrice= &maxPrice= &inStock=true &sort=newest|price_asc|price_desc|popular
//   &page=1 &limit=24 &all=true (bypass pagination — admin lists / order form)
exports.listProducts = async (req, res) => {
  const {
    search,
    active,
    category,
    minPrice,
    maxPrice,
    inStock,
    sort = 'newest',
    page = 1,
    limit = 24,
    all,
  } = req.query;

  const filter = {};
  if (search) filter.$text = { $search: search };
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;

  if (category) {
    const catId = await resolveCategoryId(category);
    // An unknown category slug should yield an empty page, not "everything".
    filter.categoryPath = catId || new mongoose.Types.ObjectId();
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  if (inStock === 'true') {
    filter.$or = [{ trackInventory: false }, { stock: { $gt: 0 } }];
  }

  const sortSpec = SORTS[sort] || SORTS.newest;

  if (all === 'true') {
    const products = await Product.find(filter).sort(sortSpec).populate('category', 'name slug');
    return res.json({ products, total: products.length, page: 1, pages: 1 });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(60, Math.max(1, parseInt(limit, 10) || 24));

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sortSpec)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('category', 'name slug'),
    Product.countDocuments(filter),
  ]);

  res.json({ products, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 });
};

// GET /api/products/:id   (:id may be an ObjectId or a slug)
exports.getProduct = async (req, res) => {
  const { id } = req.params;
  let product = null;
  if (mongoose.isValidObjectId(id)) {
    product = await Product.findById(id).populate('category', 'name slug parent');
  }
  if (!product) {
    product = await Product.findOne({ slug: id }).populate('category', 'name slug parent');
  }
  if (!product) return res.status(404).json({ message: 'Product not found' });

  let breadcrumb = [];
  if (product.category) {
    const cat = await Category.findById(product.category._id || product.category);
    if (cat) breadcrumb = await cat.getPath();
  }

  res.json({ ...product.toObject(), breadcrumb });
};

// POST /api/products/:id/view   (public — storefront product detail page)
// Debounced per session on the client so this is ~one call per real view.
exports.recordProductView = async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { $inc: { viewCount: 1 } },
    { new: true }
  ).select('viewCount category');
  if (!product) return res.status(404).json({ message: 'Product not found' });

  analytics.record({
    type: 'product_view',
    product: product._id,
    category: product.category || null,
    sessionId: req.body.sessionId || '',
    customer: req.customer ? req.customer._id : null,
    path: req.body.path || '',
  });

  res.json({ viewCount: product.viewCount });
};

const EDITABLE_FIELDS = [
  'name',
  'price',
  'description',
  'deliveryCharge',
  'sku',
  'category',
  'images',
  'videos',
  'stock',
  'trackInventory',
  'lowStockThreshold',
  'isActive',
  'paymentPolicy',
];

function pickEditable(body) {
  const out = {};
  EDITABLE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) out[field] = body[field];
  });
  if (out.category === '' || out.category === 'null') out.category = null;
  return out;
}

// POST /api/products
exports.createProduct = async (req, res) => {
  const product = await Product.create(pickEditable(req.body));
  await product.populate('category', 'name slug');
  res.status(201).json(product);
};

// PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const previousImages = [...product.images];
  const previousVideos = [...product.videos];

  Object.assign(product, pickEditable(req.body));
  await product.save(); // runs slug + categoryPath hooks
  await product.populate('category', 'name slug');

  // Safety net: the admin UI already deletes a photo/video from Cloudinary
  // the moment it's removed from the form, but this catches anything that
  // slipped through (a network hiccup, editing via the API directly, etc.)
  // so a saved product never leaves an orphaned asset behind.
  destroyRemoved(previousImages, product.images);
  destroyRemoved(previousVideos, product.videos);

  res.json(product);
};

// DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  destroyRemoved(product.images, []);
  destroyRemoved(product.videos, []);

  res.json({ message: 'Product deleted' });
};
