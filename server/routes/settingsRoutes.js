const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const BankSettings = require('../models/BankSettings');

// GET /api/settings/bank — any signed-in admin can read it (the New Order form
// shows it to the admin taking a transfer on a customer's behalf).
router.get(
  '/bank',
  protect,
  asyncHandler(async (req, res) => {
    const doc = await BankSettings.load();
    res.json(doc.toPublic());
  })
);

// PUT /api/settings/bank — super admin only.
router.put(
  '/bank',
  protect,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.isSuperAdmin) {
      return res.status(403).json({ message: 'Only a super admin can change the bank details.' });
    }
    const doc = await BankSettings.load();
    BankSettings.PUBLIC_FIELDS.forEach((k) => {
      if (req.body[k] !== undefined) doc[k] = String(req.body[k]).trim();
    });
    doc.updatedBy = req.user._id;
    await doc.save();
    res.json(doc.toPublic());
  })
);

module.exports = router;
