const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const { attachCustomer } = require('../middleware/customerAuth');
const {
  getConfig,
  subscribe,
  customerSubscribe,
  unsubscribe,
  rotate,
  test,
} = require('../controllers/pushController');

// The VAPID public key is needed by both apps before they can subscribe.
router.get('/config', getConfig);

// Drop a subscription — no auth needed to remove your own device.
router.post('/unsubscribe', asyncHandler(unsubscribe));

// Service-worker background renewal (keyed on the old endpoint, no token).
router.post('/rotate', asyncHandler(rotate));

// Storefront customer: bound to the signed-in shopper's phone.
router.post('/customer/subscribe', attachCustomer, asyncHandler(customerSubscribe));

// Admin only from here down.
router.use(protect);
router.post('/subscribe', asyncHandler(subscribe));
router.post('/test', asyncHandler(test));

module.exports = router;
