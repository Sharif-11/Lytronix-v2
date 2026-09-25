const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const BankSettings = require('../models/BankSettings');
const WalletSettings = require('../models/WalletSettings');
const paymentSettings = require('../services/paymentSettings');

const MAX_ACCOUNTS = 10;
const MAX_WALLET_ACCOUNTS = 10; // per wallet

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

// GET /api/settings/wallets — every saved bKash/Nagad/Rocket number.
router.get(
  '/wallets',
  protect,
  asyncHandler(async (req, res) => {
    res.json((await WalletSettings.load()).toAdmin());
  })
);

// PUT /api/settings/wallets  { accounts: [ {provider, number, accountName, accountType, instructions, isActive} ] }
// Super admin only. Replaces the whole list (existing accounts keep their _id
// when sent back). Any number of accounts per wallet, but only one is active
// per wallet — the server enforces that whatever the client sends.
router.put(
  '/wallets',
  protect,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.isSuperAdmin) {
      return res.status(403).json({ message: 'Only a super admin can change the wallet numbers.' });
    }
    const hasAccounts = req.body.accounts !== undefined;
    if (hasAccounts && !Array.isArray(req.body.accounts)) {
      return res.status(400).json({ message: 'accounts must be a list.' });
    }
    // { bkash?: bool, nagad?: bool, rocket?: bool } — switches a whole wallet on/off.
    const enabledPatch = req.body.enabled && typeof req.body.enabled === 'object' ? req.body.enabled : null;
    if (!hasAccounts && !enabledPatch) {
      return res.status(400).json({ message: 'Send accounts and/or enabled.' });
    }

    const seen = new Set();
    const perProvider = {};
    const accounts = [];
    for (const a of hasAccounts ? req.body.accounts : []) {
      const provider = String(a?.provider || '').toLowerCase();
      if (!WalletSettings.PROVIDERS.includes(provider)) {
        return res.status(400).json({ message: 'Wallet must be bKash, Nagad or Rocket.' });
      }
      const number = String(a?.number || '').replace(/[\s-]/g, '').replace(/^\+?88/, '');
      // Rocket numbers are a mobile number plus a check digit (12 digits) — accept that too.
      const ok = WalletSettings.BD_MOBILE.test(number) || (provider === 'rocket' && /^01[3-9]\d{9,10}$/.test(number));
      if (!ok) {
        return res.status(400).json({ message: `“${a?.number || ''}” isn't a valid ${provider} number.` });
      }
      const key = `${provider}:${number}`;
      if (seen.has(key)) {
        return res.status(400).json({ message: `${number} is already saved as a ${provider} account.` });
      }
      seen.add(key);
      perProvider[provider] = (perProvider[provider] || 0) + 1;
      if (perProvider[provider] > MAX_WALLET_ACCOUNTS) {
        return res.status(400).json({ message: `You can add up to ${MAX_WALLET_ACCOUNTS} ${provider} accounts.` });
      }
      const clean = {
        provider,
        number,
        accountName: String(a.accountName || '').trim().slice(0, 100),
        accountType: WalletSettings.ACCOUNT_TYPES.includes(a.accountType) ? a.accountType : 'personal',
        instructions: String(a.instructions || '').trim().slice(0, 500),
        isActive: a.isActive === true,
      };
      if (a._id && /^[0-9a-f]{24}$/i.test(String(a._id))) clean._id = a._id;
      accounts.push(clean);
    }

    const doc = await WalletSettings.load();
    if (hasAccounts) {
      doc.accounts = accounts;
      doc.enforceOneActive();
    }
    if (enabledPatch) {
      WalletSettings.PROVIDERS.forEach((p) => {
        if (typeof enabledPatch[p] === 'boolean') doc.enabled[p] = enabledPatch[p];
      });
    }
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
