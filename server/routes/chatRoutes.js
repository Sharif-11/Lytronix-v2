const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { attachCustomer } = require('../middleware/customerAuth');
const ctrl = require('../controllers/chatController');

// ---- Customer (storefront widget) — public; a guestKey or customer token
//      scopes access to one phone's thread. ----
router.post('/start', attachCustomer, asyncHandler(ctrl.startChat));
router.get('/messages', attachCustomer, asyncHandler(ctrl.customerMessages));
router.post('/send', attachCustomer, asyncHandler(ctrl.customerSend));

// ---- Admin ----
router.get('/threads', protect, authorize('customers:manage'), asyncHandler(ctrl.listThreads));
router.get('/threads/:phone/messages', protect, authorize('customers:manage'), asyncHandler(ctrl.adminMessages));
router.post('/threads/:phone/messages', protect, authorize('customers:manage'), asyncHandler(ctrl.adminSend));
router.patch('/threads/:phone', protect, authorize('customers:manage'), asyncHandler(ctrl.updateThread));

module.exports = router;
