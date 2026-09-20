const IncomingSms = require('../models/IncomingSms');
const Payment = require('../models/Payment');
const notificationCenter = require('./notificationCenter');
const logger = require('./logger');
const { parseSms } = require('./smsParsers');

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trxRegex = (trx) => new RegExp(`^${escapeRe(trx)}$`, 'i');
const last11 = (s) => String(s || '').replace(/\D/g, '').slice(-11);

const shortNote = (s) => String(s).slice(0, 300);

// Decide what a parsed bKash receipt means for a waiting manual-bKash payment.
// Automatic verification needs ALL of: same TrxID, same amount and — when the
// customer typed their bKash number — the same sending number. Anything else
// is left for a human (needs_review) rather than guessed at.
async function settle(sms) {
  const p = sms.parsed;
  if (!p || p.kind !== 'credit' || !p.trxId) return sms;

  // Lazy require: paymentController pulls in a lot, and this file is loaded
  // from the order controller too.
  const { mirrorIntoOrderLedger, notifyPaymentVerified } = require('../controllers/paymentController');

  const payment = await Payment.findOne({
    method: 'bkash_manual',
    status: 'pending_verification',
    transactionId: trxRegex(p.trxId),
  });

  if (!payment) {
    const already = await Payment.exists({ transactionId: trxRegex(p.trxId), status: 'verified' });
    sms.status = already ? 'duplicate' : 'unmatched';
    sms.note = already
      ? 'A payment with this TrxID is already verified.'
      : 'No waiting payment with this TrxID yet — it will be matched if an order with it arrives.';
    await sms.save();
    return sms;
  }

  sms.payment = payment._id;
  sms.order = payment.order;

  const amountOk = Math.abs(Number(payment.amount) - Number(p.amount)) < 0.01;
  const senderOk = !payment.senderNumber || last11(payment.senderNumber) === last11(p.counterparty);

  if (!amountOk || !senderOk) {
    sms.status = 'needs_review';
    sms.note = shortNote(
      [
        !amountOk ? `Amount differs: order expects Tk ${payment.amount}, SMS says Tk ${p.amount}.` : '',
        !senderOk ? `Sender differs: customer entered ${payment.senderNumber}, SMS is from ${p.counterparty}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
    await sms.save();
    notificationCenter.push({
      type: 'payment_review',
      severity: 'warning',
      title: 'bKash SMS needs a look',
      body: sms.note,
      order: payment.order,
      link: '/payments',
      meta: { trxId: p.trxId },
    });
    return sms;
  }

  // Atomic claim — two devices forwarding the same SMS can't both verify it.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'pending_verification' },
    {
      $set: {
        status: 'verified',
        verifiedBy: null,
        verifiedAt: new Date(),
        note: 'Auto-verified from the bKash SMS.',
      },
    },
    { new: true }
  );
  if (!claimed) {
    sms.status = 'duplicate';
    sms.note = 'Payment was verified by someone else a moment ago.';
    await sms.save();
    return sms;
  }

  try {
    await mirrorIntoOrderLedger(claimed);
  } catch (err) {
    logger.error('sms: ledger mirror failed', { paymentId: String(claimed._id), error: err.message });
  }
  notifyPaymentVerified(claimed.order);

  sms.status = 'verified';
  sms.note = `Auto-verified: Tk ${p.amount} from ${p.counterparty}.`;
  await sms.save();
  logger.info('sms: payment auto-verified', { paymentId: String(claimed._id), trxId: p.trxId });

  notificationCenter.push({
    type: 'payment_review',
    severity: 'success',
    title: 'bKash payment verified automatically',
    body: `Tk ${p.amount} from ${p.counterparty} · TrxID ${p.trxId}`,
    order: claimed.order,
    link: `/orders/${claimed.order}`,
    meta: { trxId: p.trxId },
  });
  return sms;
}

// Store one forwarded SMS and act on it. Idempotent per (device, clientId).
async function ingest(device, m) {
  const existing = await IncomingSms.findOne({ device: device._id, clientId: m.clientId });
  if (existing) return { clientId: m.clientId, status: existing.status, duplicate: true };

  const hit = parseSms(m.sender, m.body);
  const doc = new IncomingSms({
    device: device._id,
    clientId: m.clientId,
    sender: m.sender,
    body: m.body,
    receivedAt: m.receivedAt,
    provider: hit?.provider || '',
    parsed: hit?.parsed || undefined,
  });

  if (!hit || !hit.parsed) {
    doc.status = 'ignored';
    doc.note = hit ? 'Not a payment-received message.' : 'Sender not recognised.';
    await doc.save();
    return { clientId: m.clientId, status: doc.status };
  }

  // The same TrxID can arrive twice (two phones, or a resend after a restore).
  const seen = await IncomingSms.findOne({
    'parsed.trxId': hit.parsed.trxId,
    provider: hit.provider,
    status: { $in: ['verified', 'unmatched', 'needs_review'] },
  }).select('_id');
  if (seen) {
    doc.status = 'duplicate';
    doc.note = 'This TrxID was already received.';
    await doc.save();
    return { clientId: m.clientId, status: doc.status };
  }

  await doc.save();
  try {
    await settle(doc);
  } catch (err) {
    doc.status = 'error';
    doc.note = shortNote(err.message);
    await doc.save().catch(() => {});
    logger.error('sms: settle failed', { error: err.message });
  }
  return { clientId: m.clientId, status: doc.status };
}

// Called when a manual-bKash payment is created: the SMS often arrives BEFORE
// the customer finishes the checkout form, so look for a receipt already waiting.
async function tryMatchNewPayment(payment) {
  try {
    if (!payment || payment.method !== 'bkash_manual' || !payment.transactionId) return;
    const sms = await IncomingSms.findOne({
      'parsed.trxId': trxRegex(payment.transactionId),
      status: 'unmatched',
    });
    if (sms) await settle(sms);
  } catch (err) {
    logger.error('sms: tryMatchNewPayment failed', { error: err.message });
  }
}

module.exports = { ingest, settle, tryMatchNewPayment };
