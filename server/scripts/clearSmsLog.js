// Wipes the SMS listener's message log (IncomingSms) — the audit trail of
// forwarded texts, not the paired devices or pairing codes themselves.
// Payments already verified from these messages are untouched.
//   node scripts/clearSmsLog.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const IncomingSms = require('../models/IncomingSms');

(async () => {
  await connectDB();
  const result = await IncomingSms.deleteMany({});
  console.log(`Deleted ${result.deletedCount || 0} SMS log entries.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('clearSmsLog failed:', err);
  process.exit(1);
});
