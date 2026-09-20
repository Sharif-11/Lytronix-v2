const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { getSteadfastBalance, listSteadfastWebhookLogs } = require('../controllers/orderController');

router.get('/steadfast/balance', protect, authorize('orders:manage', 'orders:view'), asyncHandler(getSteadfastBalance));
router.get('/steadfast/webhook-logs', protect, authorize('orders:manage', 'orders:view'), asyncHandler(listSteadfastWebhookLogs));

module.exports = router;
