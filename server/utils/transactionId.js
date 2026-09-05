const Payment = require('../models/Payment');
const Order = require('../models/Order');

// A transaction id must be globally unique across the whole app — it can't
// appear on two different payments, whether those live in the standalone
// Payment collection or embedded in an Order's payment ledger. Returns the
// place it's already used ('payment' | 'order-ledger') or null if free.
//
// `exceptPaymentId` / `exceptOrderId` let a caller ignore the record the id
// legitimately already belongs to (e.g. mirroring a verified Payment into
// its own order's ledger).
async function transactionIdTakenBy(txnId, { exceptPaymentId, exceptOrderId } = {}) {
  const id = String(txnId || '').trim();
  if (!id) return null;

  const paymentQuery = { transactionId: id };
  if (exceptPaymentId) paymentQuery._id = { $ne: exceptPaymentId };
  if (await Payment.exists(paymentQuery)) return 'payment';

  const orderQuery = { 'payments.transactionId': id };
  if (exceptOrderId) orderQuery._id = { $ne: exceptOrderId };
  if (await Order.exists(orderQuery)) return 'order-ledger';

  return null;
}

async function assertTransactionIdFree(txnId, opts) {
  const where = await transactionIdTakenBy(txnId, opts);
  if (where) {
    const err = new Error('This transaction ID has already been used. Each payment must have a unique transaction ID.');
    err.statusCode = 409;
    throw err;
  }
}

module.exports = { transactionIdTakenBy, assertTransactionIdFree };
