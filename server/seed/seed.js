// Run once (or safely re-run — it's idempotent) to set up default roles, a
// first superadmin login, and a starter category tree:
//   npm run seed
// Reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME from .env,
// falling back to the defaults below if not set.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Role = require('../models/Role');
const User = require('../models/User');
const Category = require('../models/Category');

const DEFAULT_ROLES = [
  {
    name: 'Super Admin',
    description: 'Full access to everything, including staff and role management.',
    isSuperAdmin: true,
    isSystem: true,
    permissions: Role.PERMISSIONS,
  },
  {
    name: 'Store Manager',
    description: 'Manages the catalogue, orders, customers, payments and insights day-to-day.',
    isSystem: true,
    permissions: [
      'catalogue:view',
      'products:manage',
      'categories:manage',
      'orders:view',
      'orders:manage',
      'payments:manage',
      'customers:manage',
      'analytics:view',
      'reports:view',
    ],
  },
  {
    name: 'Catalogue Manager',
    description: 'Maintains products and categories only.',
    isSystem: true,
    permissions: ['catalogue:view', 'products:manage', 'categories:manage'],
  },
  {
    name: 'Order Processor',
    description: 'Handles order verification, pricing edits and courier booking only.',
    isSystem: true,
    permissions: ['catalogue:view', 'orders:view', 'orders:manage', 'payments:manage'],
  },
  {
    name: 'Viewer',
    description: 'Read-only access, e.g. for reporting.',
    isSystem: true,
    permissions: ['catalogue:view', 'orders:view', 'analytics:view', 'reports:view'],
  },
];

// A small starter tree — only planted if there are no categories yet.
const STARTER_CATEGORIES = [
  { name: 'Power Banks', children: ['Fast Charge', 'Solar', 'High Capacity'] },
  { name: 'Chargers & Cables', children: ['Wall Chargers', 'Car Chargers', 'USB-C Cables'] },
  { name: 'Batteries', children: ['AA / AAA', 'Lithium Cells', 'Rechargeable Packs'] },
  { name: 'Accessories', children: ['Adapters', 'Cases', 'Cable Organisers'] },
];

async function run() {
  await connectDB();

  for (const roleDef of DEFAULT_ROLES) {
    const existing = await Role.findOne({ name: roleDef.name });
    if (existing) {
      existing.permissions = roleDef.permissions;
      existing.isSuperAdmin = roleDef.isSuperAdmin || false;
      existing.isSystem = true;
      existing.description = roleDef.description;
      await existing.save();
      console.log(`Role "${roleDef.name}" updated.`);
    } else {
      await Role.create(roleDef);
      console.log(`Role "${roleDef.name}" created.`);
    }
  }

  const superAdminRole = await Role.findOne({ isSuperAdmin: true });

  // Phone is the one mandatory identifier for every admin account, including
  // the superadmin — it's how "forgot password" SMS reaches them. Email is
  // optional.
  const phone = (process.env.SEED_ADMIN_PHONE || '').trim();
  if (!phone) {
    throw new Error(
      'SEED_ADMIN_PHONE is required in server/.env (e.g. 01700000000) — the superadmin account needs a phone number for login and "forgot password" SMS.'
    );
  }
  const email = process.env.SEED_ADMIN_EMAIL ? process.env.SEED_ADMIN_EMAIL.toLowerCase().trim() : undefined;
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';

  let user = await User.findOne({ phone });
  if (user) {
    console.log(`Superadmin user with phone "${phone}" already exists — leaving it as-is.`);
  } else {
    user = new User({ name, email, phone, role: superAdminRole._id });
    await user.setPassword(password);
    await user.save();
    console.log(
      `\nSuperadmin created:\n  phone:    ${phone}\n  email:    ${email || '(none)'}\n  password: ${password}\n\nLog in (with the phone number or email) and change this password immediately (Profile > Change Password).`
    );
  }

  const categoryCount = await Category.countDocuments();
  if (categoryCount === 0) {
    for (let i = 0; i < STARTER_CATEGORIES.length; i++) {
      const def = STARTER_CATEGORIES[i];
      // eslint-disable-next-line no-await-in-loop
      const parent = await Category.create({ name: def.name, sortOrder: i });
      for (let j = 0; j < def.children.length; j++) {
        // eslint-disable-next-line no-await-in-loop
        await Category.create({ name: def.children[j], parent: parent._id, sortOrder: j });
      }
    }
    console.log(`Seeded ${STARTER_CATEGORIES.length} categories with sub-categories.`);
  } else {
    console.log(`${categoryCount} categories already exist — skipping category seed.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
