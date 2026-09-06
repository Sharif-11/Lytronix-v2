// Manual / cron entry point for the chat retention sweep.
//   node scripts/purgeChat.js [days]
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { purgeOldChatMessages, RETENTION_DAYS } = require('../services/chatCleanup');

(async () => {
  await connectDB();
  const days = Number(process.argv[2]) || RETENTION_DAYS;
  const result = await purgeOldChatMessages({ olderThanDays: days });
  console.log(`Purged messages older than ${days}d:`, result);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('purgeChat failed:', err);
  process.exit(1);
});
