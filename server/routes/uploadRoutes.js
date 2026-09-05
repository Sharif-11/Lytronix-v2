const express = require('express');
const multer = require('multer');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const {
  uploadProductImage,
  uploadImage,
  uploadProductVideo,
  uploadPaymentProof,
  deleteAsset,
} = require('../controllers/uploadController');

const IMAGE_MAX_BYTES = 1 * 1024 * 1024; // 1MB
const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50MB

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video files are allowed.'));
    }
    cb(null, true);
  },
});

// Multer's own "file too large" error doesn't carry a friendly message by
// default — translate it so the admin's upload UI can show a clear reason
// instead of a raw MulterError. `limitLabel` is fixed per route, not
// introspected, so it's always right regardless of how Express matched.
function handleUploadError(limitLabel) {
  return (err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: `File is too large — the limit is ${limitLabel}.` });
    }
    next(err);
  };
}

// Admin-only: catalogue photos. Images must be under 1MB.
router.post(
  '/product-image',
  protect,
  authorize('products:manage'),
  (req, res, next) => imageUpload.single('image')(req, res, (err) => handleUploadError('1MB')(err, req, res, next)),
  asyncHandler(uploadProductImage)
);

// Admin-only: catalogue videos. Videos must be under 50MB.
router.post(
  '/product-video',
  protect,
  authorize('products:manage'),
  (req, res, next) => videoUpload.single('video')(req, res, (err) => handleUploadError('50MB')(err, req, res, next)),
  asyncHandler(uploadProductVideo)
);

// Admin: generic catalogue image (category art, banners). Any user who can
// manage products or categories can upload.
router.post(
  '/image',
  protect,
  authorize('products:manage', 'categories:manage'),
  (req, res, next) => imageUpload.single('image')(req, res, (err) => handleUploadError('1MB')(err, req, res, next)),
  asyncHandler(uploadImage)
);

// Admin: delete a previously-uploaded asset from Cloudinary by its stored
// URL — used when a photo/video is removed from a product or category so it
// doesn't linger as an orphan in the Cloudinary account.
router.delete('/', protect, authorize('products:manage', 'categories:manage'), asyncHandler(deleteAsset));

// Public: a customer attaches their bKash transfer screenshot at checkout,
// before they're logged in to anything — there's no admin session at that point.
router.post(
  '/payment-proof',
  (req, res, next) => imageUpload.single('image')(req, res, (err) => handleUploadError('1MB')(err, req, res, next)),
  asyncHandler(uploadPaymentProof)
);

module.exports = router;
