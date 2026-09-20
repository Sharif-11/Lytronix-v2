const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const BankSettings = require('../models/BankSettings');
const paymentSettings = require('../services/paymentSettings');

const MAX_ACCOUNTS = 10;

// GET /api/settings/bank — any signed-in admin can read it (the New Order form
// shows the accounts to the admin taking a transfer on a customer's behalf).
router.get(
  '/bank',
  protect,
  asyncHandler(async (req, res) => {
    const doc = await BankSettings.load();
    res.json(doc.toAdmin());
  })
);

// PUT /api/settings/bank  { accounts: [ {bankName, accountName, ...} ] } — super admin only.
// Replaces the whole list (existing accounts keep their _id when sent back);
// activeIndex = which account in that list customers are shown.
router.put(
  '/bank',
  protect,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.isSuperAdmin) {
      return res.status(403).json({ message: 'Only a super admin can change the bank details.' });
    }
    if (!Array.isArray(req.body.accounts)) {
      return res.status(400).json({ message: 'accounts must be a list.' });
    }
    if (req.body.accounts.length > MAX_ACCOUNTS) {
      return res.status(400).json({ message: `You can add up to ${MAX_ACCOUNTS} bank accounts.` });
    }

    const accounts = req.body.accounts.map((a) => {
      const clean = {};
      BankSettings.ACCOUNT_FIELDS.forEach((k) => {
        clean[k] = String(a?.[k] ?? '').trim();
      });
      if (a?._id && /^[0-9a-f]{24}$/i.test(String(a._id))) clean._id = a._id;
      return clean;
    });

    const doc = await BankSettings.load();
    doc.accounts = accounts;
    // The client says which card (by position) is active; store that account's id.
    const idx = Number.isInteger(req.body.activeIndex) ? req.body.activeIndex : -1;
    doc.activeAccountId = doc.accounts[idx] ? String(doc.accounts[idx]._id) : '';
    doc.updatedBy = req.user._id;
    await doc.save();
    res.json(doc.toAdmin());
  })
);

// GET /api/settings/payments — which methods customers may choose.
router.get(
  '/payments',
  protect,
  asyncHandler(async (req, res) => {
    const bkash = require('../services/payments').getGateway('bkash');
    res.json({
      methods: await paymentSettings.refresh(),
      // Automated bKash also needs the gateway itself to be set up on the server.
      bkashGatewayReady: Boolean(bkash && bkash.isEnabled && bkash.isEnabled()),
    });
  })
);

// PUT /api/settings/payments  { cod?, bkash_manual?, bkash_automated?, bank_transfer? } — super admin only.
router.put(
  '/payments',
  protect,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.isSuperAdmin) {
      return res.status(403).json({ message: 'Only a super admin can change the payment methods.' });
    }
    // Never leave checkout with nothing to pay by: check the result before saving.
    const next = { ...paymentSettings.get() };
    Object.keys(next).forEach((m) => {
      if (typeof req.body?.[m] === 'boolean') next[m] = req.body[m];
    });
    if (!Object.values(next).some(Boolean)) {
      return res.status(400).json({ message: 'At least one payment method must stay enabled.' });
    }
    const methods = await paymentSettings.update(req.body || {}, req.user._id);
    res.json({ methods });
  })
);

module.exports = router;
