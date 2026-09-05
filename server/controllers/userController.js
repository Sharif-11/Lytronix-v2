const User = require('../models/User');
const Role = require('../models/Role');

async function listUsers(req, res) {
  const users = await User.find().populate('role').sort({ createdAt: -1 });
  res.json(users.map((u) => u.toSafeJSON()));
}

async function getUser(req, res) {
  const user = await User.findById(req.params.id).populate('role');
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(user.toSafeJSON());
}

// Phone + password (+ role) are the only mandatory fields for any admin
// account, including the superadmin — name and email are optional extras.
async function createUser(req, res) {
  const { name, email, phone, password, role: roleId } = req.body;
  if (!phone || !password || !roleId) {
    return res.status(400).json({ message: 'Phone number, password and role are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const role = await Role.findById(roleId);
  if (!role) return res.status(400).json({ message: 'Selected role does not exist.' });

  const existingPhone = await User.findOne({ phone: phone.trim() });
  if (existingPhone) return res.status(409).json({ message: 'A user with this phone number already exists.' });

  const normalisedEmail = email ? email.toLowerCase().trim() : undefined;
  if (normalisedEmail) {
    const existingEmail = await User.findOne({ email: normalisedEmail });
    if (existingEmail) return res.status(409).json({ message: 'A user with this email already exists.' });
  }

  const user = new User({
    name: name || '',
    email: normalisedEmail,
    phone: phone.trim(),
    role: role._id,
  });
  await user.setPassword(password);
  await user.save();
  await user.populate('role');

  res.status(201).json(user.toSafeJSON());
}

async function updateUser(req, res) {
  const { name, phone, email, role: roleId, isActive, password } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  if (name !== undefined) user.name = name;
  if (isActive !== undefined) user.isActive = isActive;

  if (phone !== undefined) {
    if (!phone.trim()) return res.status(400).json({ message: 'Phone number cannot be empty.' });
    const existing = await User.findOne({ phone: phone.trim(), _id: { $ne: user._id } });
    if (existing) return res.status(409).json({ message: 'A user with this phone number already exists.' });
    user.phone = phone.trim();
  }

  if (email !== undefined) {
    const normalisedEmail = email ? email.toLowerCase().trim() : undefined;
    if (normalisedEmail) {
      const existing = await User.findOne({ email: normalisedEmail, _id: { $ne: user._id } });
      if (existing) return res.status(409).json({ message: 'A user with this email already exists.' });
    }
    user.email = normalisedEmail;
  }

  if (roleId) {
    const role = await Role.findById(roleId);
    if (!role) return res.status(400).json({ message: 'Selected role does not exist.' });
    user.role = role._id;
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    await user.setPassword(password);
    user.mustChangePassword = false;
  }

  await user.save();
  await user.populate('role');
  res.json(user.toSafeJSON());
}

async function deleteUser(req, res) {
  if (String(req.params.id) === String(req.user._id)) {
    return res.status(400).json({ message: "You can't delete your own account." });
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json({ message: 'User deleted.' });
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser };
