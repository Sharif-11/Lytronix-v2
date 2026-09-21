// Steadfast's delivery_status values -> this app's order status vocabulary.
//
// Business rule (per merchant instructions):
//   - Booking a parcel sets OUR status to "processing" (see bookSteadfast).
//   - Steadfast "pending" (parcel accepted / in transit) maps to our "shipped".
//     Any "*_approval_pending" variant (from the /status_by_cid check — the
//     outcome isn't final yet) maps to "shipped" too, same idea as "pending".
//   - "delivered" maps to "delivered".
//   - "unknown" / "unknown_approval_pending" leaves our status untouched —
//     there's nothing actionable to mirror.
//   - "in_review" (booked, awaiting Steadfast's approval) maps to "processing".
//   - Every other status (partial_delivered, cancelled, hold, ...)
//     is mirrored onto our order verbatim.
//   Our status and the courier's raw status (order.courier.status) are kept
//   separately: admins see both, customers only ever see ours. An admin can
//   overwrite the status by hand at any time.
function mapSteadfastStatus(steadfastStatus) {
  if (!steadfastStatus) return null;
  const key = String(steadfastStatus).trim().toLowerCase();

  if (key === 'unknown' || key === 'unknown_approval_pending') return null;
  if (key === 'pending' || key.endsWith('_approval_pending')) return 'shipped';
  // in_review = booked, waiting for Steadfast to approve it. Still our 'processing' —
  // mirroring it would flip a freshly booked order to 'in_review' on the first sync.
  if (key === 'in_review') return 'processing';

  return key;
}

module.exports = { mapSteadfastStatus };
