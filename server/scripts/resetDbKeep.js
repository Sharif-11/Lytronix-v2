/**
 * DANGER: wipes the database EXCEPT:
 *   - the Customer notebook  (collection: customers)
 *   - super-admin User(s)    (users whose role.isSuperAdmin === true)
 *   - Role definitions       (the permission system — kept so login/RBAC works)
 *
 * Everything else (orders, payments, products, categories, carts, chats,
 * analytics, notifications, OTPs, SMS logs, contact messages, storefront
 * customer accounts, saved products) is dropped.
 *
 *   node scripts/resetDbKeep.js --yes
 *
 * Requires the literal --yes flag. Prints the target + a 5s countdown first.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Role = require('../models/Role');

// Collections emptied completely.
const WIPE = [
  'analyticsevents',
  'carts',
  'categories',
  'chatmessages',
  'chatthreads',
  'contactmessages',
  'customeraccounts',
  'notifications',
  'orders',
  'otprequests',
  'payments',
  'products',
  'savedproducts',
  'smslogs',
];

async function run() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes.  Usage: node scripts/resetDbKeep.js --yes');
    process.exit(1);
  }

  await connectDB();
  const { name, host } = mongoose.connection;
  const db = mongoose.connection.db;

  const superRoles = await Role.find({ isSuperAdmin: true }).select('_id name').lean();
  const superRoleIds = superRoles.map((r) => r._id);
  const superUsers = await User.find({ role: { $in: superRoleIds } }).select('email phone').lean();
  const keptCustomers = await db.collection('customers').countDocuments().catch(() => 0);

  console.log(`\n  Target: ${host} / ${name}`);
  console.log('\n  KEEP:');
  console.log(`    customers (notebook) : ${keptCustomers} doc(s)`);
  console.log(`    roles                : ${superRoles.length} super + others, all kept`);
  console.log(`    super-admin users    : ${superUsers.map((u) => u.email || u.phone).join(', ') || '(none!)'}`);
  console.log('\n  WIPE:');
  for (const c of WIPE) {
    // eslint-disable-next-line no-await-in-loop
    const n = await db.collection(c).countDocuments().catch(() => 0);
    console.log(`    ${c.padEnd(20)} ${n}`);
  }
  const staleUsers = await User.countDocuments({ role: { $nin: superRoleIds } });
  console.log(`    non-super users      ${staleUsers}`);

  if (superUsers.length === 0) {
    console.error('\n  ABORT: no super-admin user found — refusing to wipe and lock you out.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\n  Proceeding in 5 seconds — Ctrl+C to abort.\n');
  await new Promise((r) => setTimeout(r, 5000));

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const c of WIPE) {
    if (!existing.has(c)) {
      console.log(`  skip     ${c} (absent)`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await db.dropCollection(c);
    console.log(`  dropped  ${c}`);
  }

  const delUsers = await User.deleteMany({ role: { $nin: superRoleIds } });
  console.log(`  removed  ${delUsers.deletedCount} non-super user(s)`);

  await mongoose.disconnect();
  console.log(`\n  Done. Kept: customers, roles, ${superUsers.length} super-admin user(s).\n`);
}

run().catch((err) => {
  console.error('resetDbKeep failed:', err);
  process.exit(1);
});
