/**
 * Inserts one demo product for testing the public product landing page
 * (/p/:slug on the storefront). Idempotent — re-running updates the same
 * product (matched by SKU) instead of creating duplicates.
 *
 *   node scripts/seedDemoProduct.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const DEMO = {
  sku: 'DEMO-LFP-12V100',
  name: '12V 100Ah LiFePO4 ব্যাটারি প্যাক (বিল্ট-ইন BMS)',
  price: 32500,
  deliveryCharge: 150,
  stock: 25,
  trackInventory: true,
  lowStockThreshold: 5,
  description: [
    'আইপিএস, সোলার ও ইউপিএস ব্যাকআপের জন্য তৈরি 12.8V 100Ah LiFePO4 ব্যাটারি প্যাক।',
    '',
    '• গ্রেড-A প্রিজম্যাটিক সেল, ~6000 সাইকেল লাইফ',
    '• বিল্ট-ইন 100A BMS — ওভারচার্জ, ওভার-ডিসচার্জ ও শর্ট সার্কিট প্রোটেকশন',
    '• ওজন লিড-অ্যাসিডের প্রায় এক-তৃতীয়াংশ, রক্ষণাবেক্ষণমুক্ত',
    '• ১ বছরের রিপ্লেসমেন্ট ওয়ারেন্টি',
    '',
    'সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।',
  ].join('\n'),
  images: [
    'https://picsum.photos/seed/lytronix-lfp-a/1200/1200',
    'https://picsum.photos/seed/lytronix-lfp-b/1200/1200',
    'https://picsum.photos/seed/lytronix-lfp-c/1200/1200',
  ],
  videos: [],
  category: null,
  paymentPolicy: { codAllowed: true, advanceType: 'none', advanceAmount: 0, advancePercent: 0 },
  isActive: true,
};

async function run() {
  await connectDB();

  let product = await Product.findOne({ sku: DEMO.sku });
  if (product) {
    Object.assign(product, DEMO);
    await product.save();
    console.log('Demo product updated.');
  } else {
    product = await Product.create(DEMO);
    console.log('Demo product created.');
  }

  const base = process.env.CLIENT_URL && !/REPLACE/.test(process.env.CLIENT_URL)
    ? process.env.CLIENT_URL.replace(/\/$/, '')
    : 'http://192.168.0.101:5173';

  console.log('');
  console.log(`  _id:   ${product._id}`);
  console.log(`  slug:  ${product.slug}`);
  console.log(`  price: ৳${product.price}  + ৳${product.deliveryCharge} delivery`);
  console.log(`  link:  ${base}/p/${product.slug}`);
  console.log('');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('seedDemoProduct failed:', err);
  process.exit(1);
});
