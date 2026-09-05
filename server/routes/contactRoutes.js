const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const {
  submitContactMessage,
  listContactMessages,
  updateContactMessage,
  deleteContactMessage,
} = require('../controllers/contactController');

// Public: the storefront's Contact page.
router.post('/', asyncHandler(submitContactMessage));

// Admin: the contact-message inbox.
router.get('/', protect, authorize('customers:manage'), asyncHandler(listContactMessages));
router.patch('/:id', protect, authorize('customers:manage'), asyncHandler(updateContactMessage));
router.delete('/:id', protect, authorize('customers:manage'), asyncHandler(deleteContactMessage));

module.exports = router;
