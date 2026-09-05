const mongoose = require('mongoose');

// The full catalogue of permission codes the app understands, grouped for the
// admin's Roles UI. `PERMISSIONS` (flat list) stays the single source of truth
// used to validate role.permissions on save and to render checkboxes.
const PERMISSION_GROUPS = [
  {
    key: 'catalogue',
    label: 'Catalogue',
    permissions: [
      { code: 'catalogue:view', label: 'View catalogue', description: 'See products and categories (read-only).' },
      { code: 'products:manage', label: 'Manage products', description: 'Create, edit, delete products and inventory.' },
      { code: 'categories:manage', label: 'Manage categories', description: 'Create, edit, delete categories and sub-categories.' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    permissions: [
      { code: 'orders:view', label: 'View orders', description: 'Browse and open orders.' },
      { code: 'orders:manage', label: 'Manage orders', description: 'Edit pricing/discounts, change status, book courier.' },
      { code: 'payments:manage', label: 'Manage payments', description: 'Verify manual payments and log collections.' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    permissions: [
      { code: 'customers:manage', label: 'Manage customers', description: 'View and edit the customer directory.' },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    permissions: [
      { code: 'analytics:view', label: 'View analytics', description: 'Store traffic, most-viewed / most-ordered products.' },
      { code: 'reports:view', label: 'View reports', description: 'Order and revenue reporting.' },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    permissions: [
      { code: 'users:manage', label: 'Manage staff', description: 'Create and edit staff accounts.' },
      { code: 'roles:manage', label: 'Manage roles', description: 'Create and edit roles and their permissions.' },
      { code: 'settings:manage', label: 'Manage settings', description: 'SMS, courier and payment gateway configuration.' },
    ],
  },
];

const PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code));

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true, default: '' },
    permissions: {
      type: [String],
      enum: PERMISSIONS,
      default: [],
    },
    // A superadmin role bypasses individual permission checks entirely.
    isSuperAdmin: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false }, // seeded roles can't be renamed/deleted
  },
  { timestamps: true }
);

roleSchema.statics.PERMISSIONS = PERMISSIONS;
roleSchema.statics.PERMISSION_GROUPS = PERMISSION_GROUPS;

module.exports = mongoose.model('Role', roleSchema);
module.exports.PERMISSIONS = PERMISSIONS;
module.exports.PERMISSION_GROUPS = PERMISSION_GROUPS;
