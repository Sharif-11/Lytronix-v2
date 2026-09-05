const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { steadfastWebhook } = require('../controllers/orderController');

// Public endpoint — configure this exact URL (https://your-api.example.com/api/webhooks/steadfast)
// as the "Callback Url" in the Steadfast merchant portal's Webhook Integration screen,
// and set the same value as STEADFAST_WEBHOOK_TOKEN in backend/.env for the "Auth Token".
router.post('/steadfast', asyncHandler(steadfastWebhook));

module.exports = router;
