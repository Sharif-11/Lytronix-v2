const Role = require('../models/Role');
const User = require('../models/User');

async function listRoles(req, res) {
  const roles = await Role.find().sort({ createdAt: 1 });
  const userCounts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  const countMap = new Map(userCounts.map((c) => [String(c._id), c.count]));

  res.json({
    roles: roles.map((r) => ({ ...r.toObject(), userCount: countMap.get(String(r._id)) || 0 })),
    availablePermissions: Role.PERMISSIONS,
    permissionGroups: Role.PERMISSION_GROUPS,
  });
}

function validatePermissions(permissions) {
  const invalid = (permissions || []).filter((p) => !Role.PERMISSIONS.includes(p));
  return invalid;
}

async function createRole(req, res) {
  const { name, description, permissions } = req.body;
  if (!name) return res.status(400).json({ message: 'Role name is required.' });

  const invalid = validatePermissions(permissions);
  if (invalid.length) {
    return res.status(400).json({ message: `Unknown permissions: ${invalid.join(', ')}` });
  }

  const role = await Role.create({ name, description: description || '', permissions: permissions || [] });
  res.status(201).json(role);
}

async function updateRole(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found.' });

  // The Super Admin role is all-access by definition and stays locked.
  if (role.isSuperAdmin) {
    return res.status(400).json({ message: 'The Super Admin role cannot be edited — it always has full access.' });
  }

  const { name, description, permissions } = req.body;

  if (permissions !== undefined) {
    const invalid = validatePermissions(permissions);
    if (invalid.length) {
      return res.status(400).json({ message: `Unknown permissions: ${invalid.join(', ')}` });
    }
    role.permissions = permissions;
  }
  if (description !== undefined) role.description = description;

  // Built-in roles keep their name (staff learn them); custom roles can rename.
  if (name !== undefined && name !== role.name) {
    if (role.isSystem) {
      return res.status(400).json({ message: 'A built-in role cannot be renamed, but its permissions can be changed.' });
    }
    role.name = name;
  }

  await role.save();
  res.json(role);
}

async function deleteRole(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found.' });
  if (role.isSystem) {
    return res.status(400).json({ message: 'This is a built-in role and cannot be deleted.' });
  }

  const inUse = await User.countDocuments({ role: role._id });
  if (inUse > 0) {
    return res.status(400).json({ message: `${inUse} user(s) still have this role. Reassign them first.` });
  }

  await role.deleteOne();
  res.json({ message: 'Role deleted.' });
}

module.exports = { listRoles, createRole, updateRole, deleteRole };
