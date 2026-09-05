const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} = require('../controllers/categoryController');

// Public: the storefront needs the category tree to browse.
router.get('/', asyncHandler(listCategories));

// Admin-only mutations.
router.patch('/reorder', protect, authorize('categories:manage'), asyncHandler(reorderCategories));
router.post('/', protect, authorize('categories:manage'), asyncHandler(createCategory));
router.put('/:id', protect, authorize('categories:manage'), asyncHandler(updateCategory));
router.delete('/:id', protect, authorize('categories:manage'), asyncHandler(deleteCategory));

// Keep the param route last so it doesn't shadow /reorder.
router.get('/:slug', asyncHandler(getCategory));

module.exports = router;
