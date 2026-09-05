const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { attachCustomer } = require('../middleware/customerAuth');
const {
  listProducts,
  getProduct,
  recordProductView,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');

// Public: storefront needs to browse the catalogue without logging in.
router.get('/', asyncHandler(listProducts));
router.get('/:id', asyncHandler(getProduct));

// Public: log a product detail view (customer optional).
router.post('/:id/view', attachCustomer, asyncHandler(recordProductView));

// Admin-only: catalogue + inventory changes.
router.post('/', protect, authorize('products:manage'), asyncHandler(createProduct));
router.put('/:id', protect, authorize('products:manage'), asyncHandler(updateProduct));
router.delete('/:id', protect, authorize('products:manage'), asyncHandler(deleteProduct));

module.exports = router;
