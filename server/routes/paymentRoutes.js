const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const {
  listPayments,
  getPayment,
  verifyPayment,
  rejectPayment,
} = require('../controllers/paymentController');

router.use(protect, authorize('payments:manage', 'orders:view'));

router.get('/', asyncHandler(listPayments));
router.get('/:id', asyncHandler(getPayment));
router.patch('/:id/verify', authorize('payments:manage'), asyncHandler(verifyPayment));
router.patch('/:id/reject', authorize('payments:manage'), asyncHandler(rejectPayment));

module.exports = router;
