const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { submitContactMessage } = require('../controllers/contactController');

// Public: the storefront's Contact page.
router.post('/', asyncHandler(submitContactMessage));

module.exports = router;
