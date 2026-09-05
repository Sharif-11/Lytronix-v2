const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  sendCustomerMessage,
  sendBroadcast,
} = require('../controllers/customerController');

router.use(protect, authorize('customers:manage'));

// Marketing messaging — registered before the /:id routes so "message" and
// "broadcast" are never swallowed as an :id.
router.post('/message', asyncHandler(sendCustomerMessage));
router.post('/broadcast', asyncHandler(sendBroadcast));

router.get('/', asyncHandler(listCustomers));
router.get('/:id', asyncHandler(getCustomer));
router.post('/', asyncHandler(createCustomer));
router.put('/:id', asyncHandler(updateCustomer));
router.delete('/:id', asyncHandler(deleteCustomer));

module.exports = router;
