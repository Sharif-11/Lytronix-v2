const SmsPairingCode = require('../models/SmsPairingCode');
const SmsDevice = require('../models/SmsDevice');
const logger = require('./logger');

// A revoked phone is kept around for a while so "Revoked" still shows in the
// admin's device list (and so a message log can still resolve `device.name`);
// after this it's just clutter.
const DEVICE_RETENTION_DAYS = Math.max(1, Number(process.env.SMS_DEVICE_RETENTION_DAYS || 30));

// Sweeps everything that counts as an "inactive pairing":
//   - a pairing code that expired and was never used (Mongo's own TTL index
//     on SmsPairingCode also removes these, but only ~1h after expiry — this
//     catches them right away)
//   - a device whose pairing was revoked more than DEVICE_RETENTION_DAYS ago
async function purgeInactivePairing({ deviceRetentionDays = DEVICE_RETENTION_DAYS } = {}) {
  const now = new Date();
  const deviceCutoff = new Date(now.getTime() - deviceRetentionDays * 24 * 60 * 60 * 1000);

  const codes = await SmsPairingCode.deleteMany({ usedAt: null, expiresAt: { $lt: now } });
  const devices = await SmsDevice.deleteMany({ revokedAt: { $ne: null, $lt: deviceCutoff } });

  const result = { codesRemoved: codes.deletedCount || 0, devicesRemoved: devices.deletedCount || 0 };
  logger.info('sms-listener: inactive pairing sweep', { ...result, deviceRetentionDays });
  return result;
}

// Run daily; first sweep ~2 min after boot so it doesn't fight startup.
function scheduleSmsListenerCleanup() {
  const run = () =>
    purgeInactivePairing().catch((err) => logger.error('sms-listener cleanup failed', { error: err.message }));
  setTimeout(run, 2 * 60 * 1000).unref?.();
  setInterval(run, 24 * 60 * 60 * 1000).unref?.();
}

module.exports = { purgeInactivePairing, scheduleSmsListenerCleanup, DEVICE_RETENTION_DAYS };
