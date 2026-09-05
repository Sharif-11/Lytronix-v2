export const formatMoney = (amount) => {
  const n = Number(amount) || 0;
  return `\u09F3 ${n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// "10:46 pm" — time only, matching how Steadfast's own tracker labels each
// event under its date header.
export const formatTime = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

export const STATUS_STYLES = {
  unverified: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-sky-50 text-sky-700 border-sky-200',
  shipped: 'bg-violet-50 text-violet-700 border-violet-200',
  in_review: 'bg-sky-50 text-sky-700 border-sky-200',
  hold: 'bg-orange-50 text-orange-700 border-orange-200',
  partial_delivered: 'bg-lime-50 text-lime-700 border-lime-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-ui-rust border-red-200',
  refunded: 'bg-orange-50 text-orange-700 border-orange-200',
  returned: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const statusStyle = (status) =>
  STATUS_STYLES[(status || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';

// ---- Tracking timeline ----
// Merges our own status changes (statusHistory) with Steadfast's granular
// location/status pings (courierEvents — from both the "delivery_status" and
// "tracking_update" webhook types) into one chronological trail, newest first.
export function mergeTrackingTimeline(order) {
  const statusEntries = (order?.statusHistory || []).map((h) => ({
    at: h.at,
    kind: 'status',
    label: h.status,
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
