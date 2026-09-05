// One-off (idempotent) migration: the old `Product.category` was a free-text
// string. This turns each distinct non-empty value into a real Category and
// repoints the product at it, populating `categoryPath` + `slug` via the
// model's save hooks.
//
//   npm run migrate:categories        (from server/)
//
// Safe to re-run: products already pointing at an ObjectId category are left
// alone.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Category = require('../models/Category');

async function run() {
  await connectDB();

  // Read raw so we see the legacy string values before Mongoose casts them.
  const raw = await mongoose.connection
    .collection('products')
    .find({}, { projection: { category: 1, name: 1 } })
    .toArray();

  const legacy = raw.filter(
    (p) => typeof p.category === 'string' && p.category.trim() !== ''
  );

  if (legacy.length === 0) {
    console.log('No products with a legacy string category. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const names = [...new Set(legacy.map((p) => p.category.trim()))];
  console.log(`Found ${legacy.length} products across ${names.length} legacy category names.`);

  const byName = new Map();
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    let cat = await Category.findOne({ name });
    if (!cat) {
      // eslint-disable-next-line no-await-in-loop
      cat = await Category.create({ name });
      console.log(`  + created category "${name}" (${cat.slug})`);
    }
    byName.set(name, cat._id);
  }

  let migrated = 0;
  for (const p of legacy) {
    const catId = byName.get(p.category.trim());
    // eslint-disable-next-line no-await-in-loop
    const doc = await Product.findById(p._id);
    if (!doc) continue;
    doc.category = catId;
    doc.markModified('category');
    // eslint-disable-next-line no-await-in-loop
    await doc.save(); // runs slug + categoryPath hooks
    migrated += 1;
  }

  console.log(`Repointed ${migrated} products. Done.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
