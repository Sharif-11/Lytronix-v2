// Steadfast's delivery_status values -> this app's order status vocabulary.
//
// Business rule (per merchant instructions):
//   - "pending" and "in_review" (the courier hasn't resolved the parcel yet)
//     map to our "pending".
//   - Any "*_approval_pending" variant (from the /status_by_cid check — the
//     outcome isn't final yet) maps to "pending" too, same idea as "pending".
//   Our status and the courier's raw status (order.courier.status) are kept
//   separately: admins see both, customers only ever see ours.
//   - "unknown" / "unknown_approval_pending" leaves our status untouched —
//     there's nothing actionable to mirror.
//   - Everything else (delivered, partial_delivered, cancelled, hold, ...)
//     is mirrored onto our order verbatim, so e.g. a
//     "delivered" webhook sets order.status to "delivered" directly.
function mapSteadfastStatus(steadfastStatus) {
  if (!steadfastStatus) return null;
  const key = String(steadfastStatus).trim().toLowerCase();

  if (key === 'unknown' || key === 'unknown_approval_pending') return null;
  if (key === 'pending' || key === 'in_review' || key.endsWith('_approval_pending')) return 'pending';

  return key;
}

module.exports = { mapSteadfastStatus };
