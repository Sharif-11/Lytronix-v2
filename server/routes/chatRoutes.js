const express = require('express');
const multer = require('multer');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect, authorize } = require('../middleware/auth');
const { attachCustomer } = require('../middleware/customerAuth');
const ctrl = require('../controllers/chatController');

const MEDIA_MAX_BYTES = 8 * 1024 * 1024; // 8MB — covers a photo or a short voice note
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (/^(image|audio)\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only images and voice notes can be attached.'));
  },
});
const onUploadError = (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File is too large — the limit is 8MB.' });
  }
  if (err) return res.status(400).json({ message: err.message });
  next();
};

// ---- Customer (storefront widget) — public; a guestKey or customer token
//      scopes access to one phone's thread. ----
router.post('/start', attachCustomer, asyncHandler(ctrl.startChat));
router.get('/messages', attachCustomer, asyncHandler(ctrl.customerMessages));
router.post('/send', attachCustomer, asyncHandler(ctrl.customerSend));
router.patch('/messages/:id', attachCustomer, asyncHandler(ctrl.customerEditMessage));
router.delete('/messages/:id', attachCustomer, asyncHandler(ctrl.customerDeleteMessage));

// Attachment upload — used by both sides (auth handled in the controller).
router.post(
  '/upload',
  attachCustomer,
  (req, res, next) => mediaUpload.single('file')(req, res, (err) => onUploadError(err, req, res, next)),
  asyncHandler(ctrl.uploadMedia)
);

// ---- Admin ----
router.get('/threads', protect, authorize('customers:manage'), asyncHandler(ctrl.listThreads));
router.get('/threads/:phone/messages', protect, authorize('customers:manage'), asyncHandler(ctrl.adminMessages));
router.post('/threads/:phone/messages', protect, authorize('customers:manage'), asyncHandler(ctrl.adminSend));
router.patch('/threads/:phone/messages/:id', protect, authorize('customers:manage'), asyncHandler(ctrl.adminEditMessage));
router.delete('/threads/:phone/messages/:id', protect, authorize('customers:manage'), asyncHandler(ctrl.adminDeleteMessage));
router.patch('/threads/:phone', protect, authorize('customers:manage'), asyncHandler(ctrl.updateThread));

// AI auto-reply assistant — on/off switch + knowledge base editor.
router.get('/ai-settings', protect, authorize('customers:manage'), asyncHandler(ctrl.getAiSettings));
router.put('/ai-settings', protect, authorize('customers:manage'), asyncHandler(ctrl.updateAiSettings));
router.get('/ai-logs', protect, authorize('customers:manage'), asyncHandler(ctrl.listAiLogs));

module.exports = router;
