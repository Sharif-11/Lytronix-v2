// Steadfast's delivery_status values -> this app's order status vocabulary.
//
// Business rule (per merchant instructions):
//   - "pending" (parcel in transit, not yet resolved) maps to our "shipped".
//   - Any "*_approval_pending" variant (from the /status_by_cid check — the
//     outcome isn't final yet) also maps to "shipped", same idea as "pending".
//   - "unknown" / "unknown_approval_pending" leaves our status untouched —
//     there's nothing actionable to mirror.
//   - Everything else (delivered, partial_delivered, cancelled, hold,
//     in_review, ...) is mirrored onto our order verbatim, so e.g. a
//     "delivered" webhook sets order.status to "delivered" directly.
function mapSteadfastStatus(steadfastStatus) {
  if (!steadfastStatus) return null;
  const key = String(steadfastStatus).trim().toLowerCase();

  if (key === 'unknown' || key === 'unknown_approval_pending') return null;
  if (key === 'pending' || key.endsWith('_approval_pending')) return 'shipped';

  return key;
}

module.exports = { mapSteadfastStatus };
