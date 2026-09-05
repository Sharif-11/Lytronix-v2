const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const { login, me, changePassword, forgotPassword } = require('../controllers/authController');
const { requestOtp, verifyOtp } = require('../controllers/customerAuthController');

// ---- Admin / staff auth (email + password) ----
router.post('/login', asyncHandler(login));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.get('/me', protect, asyncHandler(me));
router.post('/change-password', protect, asyncHandler(changePassword));

// ---- Storefront customer auth (phone + OTP) ----
router.post('/customer/request-otp', asyncHandler(requestOtp));
router.post('/customer/verify-otp', asyncHandler(verifyOtp));

module.exports = router;
