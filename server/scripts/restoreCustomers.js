/**
 * Restores the customer notebook from a JSON backup into the `customers`
 * collection, preserving each document's original _id and timestamps.
 *
 *   node scripts/restoreCustomers.js [path/to/backup.json]
 *
 * Default path: server/backups/customers-backup-2026-09-05T11-40-59-124Z.json
 * Skips any customer whose phone already exists, so it is safe to re-run.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Customer = require('../models/Customer');

const DEFAULT_BACKUP = path.join(
  __dirname,
  '..',
  'backups',
  'customers-backup-2026-09-05T11-40-59-124Z.json'
);

async function run() {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_BACKUP;
  if (!fs.existsSync(file)) {
    console.error(`Backup file not found: ${file}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.customers || raw.data || [];
  if (!rows.length) {
    console.error('Backup contains no customer records.');
    process.exit(1);
  }

  await connectDB();
  console.log(`\n  Restoring ${rows.length} customer(s) from ${path.basename(file)}\n`);

  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const phone = String(r.phone || '').trim();
    if (!phone) {
      skipped += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const exists = await Customer.findOne({ phone }).lean();
    if (exists) {
      console.log(`  skip   ${phone}  (already present)`);
      skipped += 1;
      continue;
    }

    const doc = {
      name: r.name || '',
      phone,
      zilla: r.zilla || '',
      thana: r.thana || '',
      address: r.address || '',
      comments: r.comments || '',
      channels: Array.isArray(r.channels) ? r.channels : [],
      priority: r.priority || 'medium',
      tags: Array.isArray(r.tags) ? r.tags : [],
    };
    if (r._id && /^[a-f\d]{24}$/i.test(r._id)) doc._id = new mongoose.Types.ObjectId(r._id);
    if (r.createdAt) doc.createdAt = new Date(r.createdAt);
    if (r.updatedAt) doc.updatedAt = new Date(r.updatedAt);

    // Raw insert so _id + timestamps are written verbatim (Model.create would
    // stamp fresh createdAt/updatedAt).
    // eslint-disable-next-line no-await-in-loop
    await Customer.collection.insertOne(doc);
    console.log(`  add    ${phone}  ${doc.name}`);
    inserted += 1;
  }

  await mongoose.disconnect();
  console.log(`\n  Done. ${inserted} inserted, ${skipped} skipped.\n`);
}

run().catch((err) => {
  console.error('restoreCustomers failed:', err);
  process.exit(1);
});
