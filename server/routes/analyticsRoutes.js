const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { attachCustomer } = require('../middleware/customerAuth');
const ctrl = require('../controllers/analyticsController');

// Public: the storefront posts lightweight events here (visitor optional).
router.post('/track', attachCustomer, asyncHandler(ctrl.track));

// Admin: reporting.
router.use(protect, authorize('analytics:view'));
router.get('/overview', asyncHandler(ctrl.overview));
router.get('/top-products', asyncHandler(ctrl.topProducts));
router.get('/top-categories', asyncHandler(ctrl.topCategories));

module.exports = router;
