const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { listSmsLogs, getSmsBalance } = require('../controllers/smsController');

router.get('/balance', protect, authorize('customers:manage', 'settings:manage'), asyncHandler(getSmsBalance));
router.get('/', protect, authorize('orders:view', 'orders:manage', 'settings:manage'), asyncHandler(listSmsLogs));

module.exports = router;
