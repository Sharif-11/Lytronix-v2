const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const { getConfig, subscribe, unsubscribe, test } = require('../controllers/pushController');

// The VAPID public key is needed by the admin app before it can subscribe.
router.get('/config', getConfig);

// Everything else is for a signed-in staff member.
router.use(protect);
router.post('/subscribe', asyncHandler(subscribe));
router.post('/unsubscribe', asyncHandler(unsubscribe));
router.post('/test', asyncHandler(test));

module.exports = router;
