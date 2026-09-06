/**
 * DANGER: drops every collection in the database named in MONGODB_URI.
 *
 *   node scripts/resetDb.js --yes
 *
 * Requires the literal --yes flag so it can't run by accident. Prints the
 * host + db name and a 5s countdown first.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function run() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes.  Usage: node scripts/resetDb.js --yes');
    process.exit(1);
  }

  await connectDB();
  const { name, host } = mongoose.connection;
  console.log(`\n  Target: ${host} / ${name}`);
  console.log('  Dropping ALL collections in 5 seconds — Ctrl+C to abort.\n');
  await new Promise((r) => setTimeout(r, 5000));

  const collections = await mongoose.connection.db.listCollections().toArray();
  if (collections.length === 0) {
    console.log('  Database is already empty — nothing to drop.');
  }
  for (const c of collections) {
    // eslint-disable-next-line no-await-in-loop
    await mongoose.connection.db.dropCollection(c.name);
    console.log(`  dropped  ${c.name}`);
  }

  await mongoose.disconnect();
  console.log(`\n  Done. ${collections.length} collection(s) dropped from ${name}.\n`);
}

run().catch((err) => {
  console.error('resetDb failed:', err);
  process.exit(1);
});
