const Order = require('../models/Order');
const SteadfastPayout = require('../models/SteadfastPayout');
const steadfast = require('./steadfast');
const notificationCenter = require('./notificationCenter');
const logger = require('./logger');

const DELIVERED = ['delivered', 'partial_delivered'];
const MAX_PAGES = 20; // safety stop; a page is only a handful of payouts

// Steadfast times are Bangladesh local ("2026-08-25 15:04:57").
function parseBdTime(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + '+06:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

let inFlight = null;

// Pulls Steadfast's payouts and marks every one of OUR orders that appears in a
// PAID payout as "COD received". Only parcels Steadfast counted as delivered
// settle (a cancelled parcel is listed in the payout but earns nothing). Parcels
// booked by hand in the Steadfast portal have no matching order and are skipped.
async function syncPayouts({ notify = true } = {}) {
  if (inFlight) return inFlight;
  inFlight = run({ notify }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run({ notify }) {
  if (!steadfast.isConfigured()) return { configured: false, payouts: 0, newlySettled: 0, settledOrders: [] };

  const summary = { configured: true, payouts: 0, fetchedDetails: 0, newlySettled: 0, settledOrders: [] };

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const list = await steadfast.getPayments(page);
    const rows = Array.isArray(list.payments) ? list.payments : list.payments?.data || [];
    if (rows.length === 0) break;

    for (const row of rows) {
      summary.payouts += 1;
      const paymentId = String(row.payment_id);
      const known = await SteadfastPayout.findOne({ paymentId });
      // Already paid and processed: nothing can change, skip the detail call.
      if (known && known.processedAt && String(known.statusLabel).toLowerCase() === 'paid') continue;

      const detail = (await steadfast.getPayment(paymentId)).payment || row;
      summary.fetchedDetails += 1;
      const isPaid = String(detail.status_label || row.status_label).toLowerCase() === 'paid';
      const parcels = Array.isArray(detail.consignments) ? detail.consignments : [];
      const paidAt = parseBdTime(detail.paid_at);

      let matched = 0;
      if (isPaid) {
        for (const c of parcels) {
          if (!DELIVERED.includes(String(c.status).toLowerCase())) continue;
          const order = await Order.findOne({
            $or: [{ 'courier.consignmentId': Number(c.consignment_id) }, ...(c.invoice ? [{ orderNumber: String(c.invoice) }] : [])],
          });
          if (!order) continue;
          matched += 1;
          if (order.courier?.payoutId) continue; // already settled (by this or an earlier payout)

          order.courier = order.courier || {};
          order.courier.payoutId = paymentId;
          order.courier.payoutPaidAt = paidAt || new Date();
          order.courier.payoutAmount = Number(c.cod_amount) || 0;
          order.courierEvents.push({ message: `COD received from Steadfast in payout ${paymentId}.`, at: new Date() });
          await order.save();
          summary.newlySettled += 1;
          summary.settledOrders.push({ orderNumber: order.orderNumber, payoutId: paymentId, amount: order.courier.payoutAmount });
        }
      }

      await SteadfastPayout.updateOne(
        { paymentId },
        {
          $set: {
            statusLabel: detail.status_label || row.status_label || '',
            method: detail.method || row.method || '',
            amount: Number(detail.amount ?? row.amount) || 0,
            dueBills: Number(detail.due_bills ?? row.due_bills) || 0,
            charges: Number(detail.charges ?? row.charges) || 0,
            total: Number(detail.total ?? row.total) || 0,
            parcelCount: parcels.length,
            matchedOrders: matched,
            createdAtRemote: parseBdTime(detail.created_at),
            paidAt,
            processedAt: isPaid ? new Date() : null,
          },
        },
        { upsert: true }
      );
    }
  }

  if (notify && summary.newlySettled > 0) {
    const amount = summary.settledOrders.reduce((n, o) => n + o.amount, 0);
    notificationCenter.push({
      type: 'system',
      severity: 'success',
      title: `COD received for ${summary.newlySettled} order${summary.newlySettled === 1 ? '' : 's'}`,
      body: `৳${amount} from Steadfast · ${summary.settledOrders.map((o) => o.orderNumber).join(', ')}`,
      link: '/',
    });
  }

  logger.info('steadfast: payout sync', { payouts: summary.payouts, details: summary.fetchedDetails, newlySettled: summary.newlySettled });
  return summary;
}

// Background check every few hours. Failures are logged and retried next time.
function startSchedule() {
  const every = 3 * 60 * 60 * 1000;
  const tick = () =>
    syncPayouts().catch((err) => logger.error('steadfast: payout sync failed', { error: err.message }));
  setTimeout(tick, 90 * 1000).unref?.();
  setInterval(tick, every).unref?.();
}

module.exports = { syncPayouts, startSchedule };
