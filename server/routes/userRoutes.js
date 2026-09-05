const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { listUsers, getUser, createUser, updateUser, deleteUser } = require('../controllers/userController');

router.use(protect, authorize('users:manage'));

router.get('/', asyncHandler(listUsers));
router.get('/:id', asyncHandler(getUser));
router.post('/', asyncHandler(createUser));
router.put('/:id', asyncHandler(updateUser));
router.delete('/:id', asyncHandler(deleteUser));

module.exports = router;
