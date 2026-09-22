// Manual entry point for the inactive-pairing sweep (also runs daily on its own — see server.js).
//   node scripts/purgeSmsListenerPairing.js [deviceRetentionDays]
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { purgeInactivePairing, DEVICE_RETENTION_DAYS } = require('../services/smsListenerCleanup');

(async () => {
  await connectDB();
  const days = Number(process.argv[2]) || DEVICE_RETENTION_DAYS;
  const result = await purgeInactivePairing({ deviceRetentionDays: days });
  console.log(`Purged inactive pairing (devices revoked >${days}d ago):`, result);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('purgeSmsListenerPairing failed:', err);
  process.exit(1);
});
