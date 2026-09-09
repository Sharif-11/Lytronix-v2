const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { trackOrder, trackOrdersByPhone } = require('../controllers/orderController');

// Public endpoints, intentionally lightweight - no auth, no sensitive fields.
router.post('/by-phone', asyncHandler(trackOrdersByPhone)); // guest "My orders" — { phone }
router.get('/:trackingId', asyncHandler(trackOrder));

module.exports = router;
