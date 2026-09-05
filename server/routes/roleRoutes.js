const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { listRoles, createRole, updateRole, deleteRole } = require('../controllers/roleController');

router.use(protect, authorize('roles:manage'));

router.get('/', asyncHandler(listRoles));
router.post('/', asyncHandler(createRole));
router.put('/:id', asyncHandler(updateRole));
router.delete('/:id', asyncHandler(deleteRole));

module.exports = router;
