export const formatMoney = (amount) => {
  const n = Number(amount) || 0;
  return `৳ ${n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

// Bangla month abbreviations — dates keep Arabic numerals (day/year) for
// consistency with prices/counts elsewhere on the site, only the month name
// is Bangla.
const BN_MONTHS = [
  'জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে',
];

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = BN_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
};

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = BN_MONTHS[d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
};

// "10:46 pm" — time only, matching how Steadfast's own tracker labels each
// event under its date header.
export const formatTime = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${mm} ${ampm}`;
};

// ---- Order status ----
// Kept in sync with server/models/Order.js SUGGESTED_STATUSES — a Steadfast
// webhook can set any of these directly (see steadfastStatusMap.js), so a
// customer's own order can land on any of them, not just the original six.
const ORDER_STATUS_BN = {
  unverified: 'পেমেন্ট ভেরিফাই বাকি',
  pending: 'পেন্ডিং',
  processing: 'প্রসেসিং',
  shipped: 'শিপড',
  delivered: 'ডেলিভারড',
  partial_delivered: 'পার্শিয়াল ডেলিভারড',
  completed: 'কমপ্লিটেড',
  cancelled: 'ক্যানসেলড',
  hold: 'হোল্ড',
  in_review: 'ইন রিভিউ',
  refunded: 'রিফান্ডেড',
  returned: 'রিটার্নড',
};

export const STATUS_STYLES = {
  unverified: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-sky-50 text-sky-700 border-sky-200',
  shipped: 'bg-violet-50 text-violet-700 border-violet-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial_delivered: 'bg-lime-50 text-lime-700 border-lime-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-ui-rust border-red-200',
  hold: 'bg-orange-50 text-orange-700 border-orange-200',
  in_review: 'bg-sky-50 text-sky-700 border-sky-200',
  refunded: 'bg-orange-50 text-orange-700 border-orange-200',
  returned: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const statusStyle = (status) =>
  STATUS_STYLES[(status || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';

// Order status is free text on the backend (an admin can type a custom
// value), so unknown values fall back to the raw string rather than "".
export const statusLabel = (status) => ORDER_STATUS_BN[(status || '').toLowerCase()] || status || '—';

// ---- Payment status / method ----
const PAYMENT_STATUS_BN = {
  pending: 'পেন্ডিং',
  pending_verification: 'ভেরিফাই চলছে',
  verified: 'ভেরিফায়েড',
  failed: 'ফেইলড',
  refunded: 'রিফান্ডেড',
};
export const paymentStatusLabel = (status) => PAYMENT_STATUS_BN[(status || '').toLowerCase()] || status || '—';

const PAYMENT_METHOD_BN = {
  cod: 'ক্যাশ অন ডেলিভারি',
  bkash_manual: 'বিকাশ (ম্যানুয়াল)',
  bkash_automated: 'বিকাশ চেকআউট',
  sslcommerz: 'এসএসএলকমার্জ',
  other: 'আদার',
};
export const paymentMethodLabel = (method) => PAYMENT_METHOD_BN[(method || '').toLowerCase()] || method || '—';

// ---- Tracking timeline ----
// Merges our own status changes (statusHistory) with Steadfast's granular
// location/status pings (courierEvents — populated from both the
// "delivery_status" and "tracking_update" webhook types) into one
// chronological "where's my parcel" trail, newest first.
export function mergeTrackingTimeline(order) {
  const statusEntries = (order?.statusHistory || []).map((h) => ({
    at: h.at,
    kind: 'status',
    label: statusLabel(h.status),
    note: h.note || '',
  }));
  const courierEntries = (order?.courierEvents || []).map((e) => ({
    at: e.at,
    kind: 'courier',
    label: e.message,
    note: '',
  }));
  return [...statusEntries, ...courierEntries].sort((a, b) => new Date(b.at) - new Date(a.at));
}

// Groups an already-sorted timeline into per-day sections — [{ dateLabel,
// entries }] — the same "date header, then time + message per line" layout
// Steadfast's own tracking page uses.
export function groupTimelineByDate(entries) {
  const groups = [];
  let current = null;
  (entries || []).forEach((entry) => {
    const label = formatDateShort(entry.at);
    if (!current || current.dateLabel !== label) {
      current = { dateLabel: label, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  });
  return groups;
}
