const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protectCustomer } = require('../middleware/customerAuth');
const ctrl = require('../controllers/accountController');

// Every route here is for a signed-in storefront customer.
router.use(protectCustomer);

// Profile
router.get('/me', asyncHandler(ctrl.getMe));
router.patch('/profile', asyncHandler(ctrl.updateProfile));
router.post('/password', asyncHandler(ctrl.setPassword));
router.delete('/password', asyncHandler(ctrl.removePassword));

// Addresses
router.post('/addresses', asyncHandler(ctrl.addAddress));
router.patch('/addresses/:addrId', asyncHandler(ctrl.updateAddress));
router.delete('/addresses/:addrId', asyncHandler(ctrl.deleteAddress));

// Orders & payments
router.get('/orders', asyncHandler(ctrl.listOrders));
router.get('/orders/:id', asyncHandler(ctrl.getOrder));
router.get('/payments', asyncHandler(ctrl.listPayments));

// Cart
router.get('/cart', asyncHandler(ctrl.getCart));
router.put('/cart', asyncHandler(ctrl.replaceCart));
router.post('/cart/merge', asyncHandler(ctrl.mergeCart));
router.post('/cart/items', asyncHandler(ctrl.addCartItem));
router.patch('/cart/items/:productId', asyncHandler(ctrl.updateCartItem));
router.delete('/cart/items/:productId', asyncHandler(ctrl.removeCartItem));

// Wishlist / saved products
router.get('/wishlist', asyncHandler(ctrl.listWishlist));
router.get('/wishlist/ids', asyncHandler(ctrl.wishlistIds));
router.post('/wishlist/:productId', asyncHandler(ctrl.addToWishlist));
router.delete('/wishlist/:productId', asyncHandler(ctrl.removeFromWishlist));

module.exports = router;
