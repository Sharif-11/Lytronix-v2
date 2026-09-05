const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { protect } = require('../middleware/auth');
const {
  listNotifications,
  markRead,
  markAllRead,
} = require('../controllers/notificationController');

// Any signed-in staff member sees the notification feed.
router.use(protect);

router.get('/', asyncHandler(listNotifications));
router.post('/read', asyncHandler(markRead));
router.post('/read-all', asyncHandler(markAllRead));

module.exports = router;
