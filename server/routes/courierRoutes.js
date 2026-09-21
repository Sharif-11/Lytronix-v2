const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { getSteadfastBalance, listSteadfastWebhookLogs } = require('../controllers/orderController');
const courier = require('../controllers/courierController');

router.get('/steadfast/balance', protect, authorize('orders:manage', 'orders:view'), asyncHandler(getSteadfastBalance));
router.get('/steadfast/webhook-logs', protect, authorize('orders:manage', 'orders:view'), asyncHandler(listSteadfastWebhookLogs));
router.get('/steadfast/fraud-check/:phone', protect, authorize('orders:manage', 'orders:view'), asyncHandler(courier.fraudCheck));
router.get('/steadfast/payments', protect, authorize('orders:manage', 'orders:view'), asyncHandler(courier.listPayouts));
router.get('/steadfast/returns', protect, authorize('orders:manage', 'orders:view'), asyncHandler(courier.listReturns));

router.get('/steadfast/pickup', protect, authorize('orders:manage', 'orders:view'), asyncHandler(courier.getPickup));
router.post('/steadfast/pickup-requests', protect, authorize('orders:manage'), asyncHandler(courier.createPickup));

router.get('/steadfast/settlement', protect, authorize('orders:manage', 'orders:view'), asyncHandler(courier.getSettlement));
router.post('/steadfast/payouts/sync', protect, authorize('orders:manage'), asyncHandler(courier.syncPayoutsNow));

module.exports = router;
