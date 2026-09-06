const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const cloudinary = require('./cloudinary');
const logger = require('./logger');

const RETENTION_DAYS = Math.max(1, Number(process.env.CHAT_RETENTION_DAYS || 30));

// Deletes chat messages older than the retention window from the DB and their
// Cloudinary attachments — but ALWAYS keeps the thread row and each thread's
// very first message, so a conversation is never lost entirely.
async function purgeOldChatMessages({ olderThanDays = RETENTION_DAYS } = {}) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const threads = await ChatThread.find().select('_id').lean();

  let removed = 0;
  let mediaRemoved = 0;

  for (const t of threads) {
    // The first message of the thread is protected.
    const first = await ChatMessage.findOne({ thread: t._id }).sort({ createdAt: 1 }).select('_id').lean();
    const q = { thread: t._id, createdAt: { $lt: cutoff } };
    if (first) q._id = { $ne: first._id };

    const old = await ChatMessage.find(q).select('_id mediaUrl').lean();
    if (old.length === 0) continue;

    for (const m of old) {
      if (m.mediaUrl) {
        // eslint-disable-next-line no-await-in-loop
        await cloudinary.destroyByUrl(m.mediaUrl).catch(() => {});
        mediaRemoved += 1;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    const res = await ChatMessage.deleteMany(q);
    removed += res.deletedCount || 0;
  }

  logger.info('chat: retention sweep', { removed, mediaRemoved, threads: threads.length, olderThanDays });
  return { removed, mediaRemoved, threadsKept: threads.length };
}

// Run daily; first sweep ~1 min after boot so it doesn't fight startup.
function scheduleChatCleanup() {
  const run = () =>
    purgeOldChatMessages().catch((err) => logger.error('chat cleanup failed', { error: err.message }));
  setTimeout(run, 60 * 1000).unref?.();
  setInterval(run, 24 * 60 * 60 * 1000).unref?.();
}

module.exports = { purgeOldChatMessages, scheduleChatCleanup, RETENTION_DAYS };
