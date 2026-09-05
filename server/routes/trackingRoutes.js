const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { trackOrder } = require('../controllers/orderController');

// Public endpoint, intentionally lightweight - no auth, no sensitive fields.
router.get('/:trackingId', asyncHandler(trackOrder));

module.exports = router;
