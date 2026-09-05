const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { attachCustomer } = require('../middleware/customerAuth');
const {
  listOrders,
  orderStats,
  getOrder,
  createOrder,
  updateOrder,
  updateStatus,
  addPayment,
  deletePayment,
  deleteOrder,
  bookSteadfastParcel,
  syncSteadfastStatus,
  aiExtractOrder,
  sendOrderMessage,
} = require('../controllers/orderController');
const { initiateBkash, bkashCallback } = require('../controllers/paymentController');

// Public: storefront checkout creates an order without an admin login.
// attachCustomer links the order to a signed-in shopper's account when a
// customer token is present, but never requires one (guest checkout stays open).
router.post('/', attachCustomer, asyncHandler(createOrder));

// Public: automated bKash checkout flow for an order the customer just created.
router.post('/:id/payments/bkash/initiate', asyncHandler(initiateBkash));
router.post('/:id/payments/bkash/callback', asyncHandler(bkashCallback));

// Everything else is admin-only order management.
router.use(protect, authorize('orders:view', 'orders:manage'));

// AI-assisted draft extraction (paste text / screenshot -> prefilled form).
router.post('/ai-extract', authorize('orders:manage'), asyncHandler(aiExtractOrder));

router.get('/stats', asyncHandler(orderStats));
router.get('/', asyncHandler(listOrders));
router.get('/:id', asyncHandler(getOrder));

// Mutating actions require the stronger permission.
router.put('/:id', authorize('orders:manage'), asyncHandler(updateOrder));
router.patch('/:id/status', authorize('orders:manage'), asyncHandler(updateStatus));
router.post('/:id/payments', authorize('orders:manage', 'payments:manage'), asyncHandler(addPayment));
router.delete('/:id/payments/:paymentId', authorize('orders:manage', 'payments:manage'), asyncHandler(deletePayment));
router.post('/:id/steadfast/book', authorize('orders:manage'), asyncHandler(bookSteadfastParcel));
router.post('/:id/steadfast/sync', authorize('orders:manage'), asyncHandler(syncSteadfastStatus));
router.post('/:id/message', authorize('orders:manage'), asyncHandler(sendOrderMessage));
router.delete('/:id', authorize('orders:manage'), asyncHandler(deleteOrder));

module.exports = router;
