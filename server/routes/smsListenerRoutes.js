const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/smsListenerController');

// ----- The phone (its own auth) -----
router.post('/pair', asyncHandler(ctrl.pair));
router.post('/messages', asyncHandler(ctrl.deviceAuth), asyncHandler(ctrl.receive));

// ----- Admin panel -----
const admin = [protect, authorize('payments:manage')];
router.post('/pairing-codes', ...admin, asyncHandler(ctrl.createPairingCode));
router.get('/devices', ...admin, asyncHandler(ctrl.listDevices));
router.delete('/devices/:id', ...admin, asyncHandler(ctrl.revokeDevice));
router.get('/messages', ...admin, asyncHandler(ctrl.listMessages));
router.post('/messages/:id/match', ...admin, asyncHandler(ctrl.rematch));

module.exports = router;
