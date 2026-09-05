import { Check, Truck, RefreshCw, AlertTriangle, PauseCircle, MapPin } from 'lucide-react';
import { formatDate, formatTime, groupTimelineByDate } from '../utils/format';

// Step-by-step: which stages an order has passed through on its way to
// delivery, derived from order.status + whether it's been booked with a
// courier. "Exception" statuses (cancelled/hold/in_review) don't fit the
// happy-path line, so they're shown as a banner above it instead.
const STEPS = [
  { key: 'placed', label: 'Order placed', done: () => true },
  { key: 'verified', label: 'Payment verified', done: (o) => o.status.toLowerCase() !== 'unverified' },
  { key: 'booked', label: 'Booked with courier', done: (o) => Boolean(o.courier?.consignmentId) },
  {
    key: 'shipped',
    label: 'In transit',
    done: (o) => ['shipped', 'delivered', 'partial_delivered'].includes(o.status.toLowerCase()),
  },
  {
    key: 'delivered',
    label: 'Delivered',
    done: (o) => ['delivered', 'partial_delivered'].includes(o.status.toLowerCase()),
  },
];

const EXCEPTIONS = {
  cancelled: { label: 'Cancelled by courier', icon: AlertTriangle, tone: 'bg-red-50 text-ui-rust border-red-200' },
  hold: { label: 'On hold with courier', icon: PauseCircle, tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  in_review: { label: 'Under review by courier', icon: AlertTriangle, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
};

export default function CourierTracker({ order, onBook, onSync, busy }) {
  const statusKey = order.status.trim().toLowerCase();
  const exception = EXCEPTIONS[statusKey];
  const stepsDone = STEPS.map((s) => s.done(order));

  return (
    <section className="bg-ui-panel border border-ui-line rounded-xl shadow-card p-4 sm:p-5">
      <h2 className="font-display text-lg text-ui-ink mb-1 flex items-center gap-2">
        <Truck size={18} className="text-ui-brand" /> Courier tracker
      </h2>

      {exception && (
        <div className={`mt-3 flex items-center gap-2 text-sm border rounded-xl px-3 py-2 ${exception.tone}`}>
          <exception.icon size={15} className="shrink-0" />
          {exception.label}
        </div>
      )}

      {/* Step-by-step progress */}
      <ol className="mt-4 flex items-start">
        {STEPS.map((step, i) => {
          const done = stepsDone[i];
          const isCurrent = done && !stepsDone[i + 1];
          return (
            <li key={step.key} className="flex-1 flex flex-col items-center text-center relative">
              {i > 0 && (
                <div
                  className={`absolute top-3 right-1/2 w-full h-0.5 -z-10 ${
                    stepsDone[i - 1] && done ? 'bg-ui-brand' : 'bg-ui-line'
                  }`}
                  style={{ left: '-50%' }}
                />
              )}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0 ${
                  done
                    ? isCurrent
                      ? 'bg-ui-brand border-ui-brand text-white'
                      : 'bg-ui-brand/15 border-ui-brand text-ui-brand'
                    : 'bg-white border-ui-line text-ui-faint'
                }`}
              >
                {done ? <Check size={13} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
              </div>
              <span
                className={`mt-1.5 text-[11px] leading-tight px-0.5 ${
                  done ? 'text-ui-ink font-medium' : 'text-ui-faint'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Courier meta + actions */}
      <div className="mt-5 pt-4 border-t border-dashed border-ui-line">
        {order.courier?.consignmentId ? (
          <dl className="space-y-1.5 text-sm">
            <Row label="Consignment ID" value={order.courier.consignmentId} mono />
            <Row label="Tracking code" value={order.courier.trackingCode || '—'} mono />
            <Row label="Steadfast status" value={order.courier.status || '—'} />
            {order.courier.lastMessage && <Row label="Last update" value={order.courier.lastMessage} />}
            {order.courier.lastSyncedAt && <Row label="Synced" value={formatDate(order.courier.lastSyncedAt)} />}
            <button onClick={onSync} disabled={busy} className="btn-secondary w-full mt-2 gap-1.5">
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Sync status'}
            </button>
          </dl>
        ) : (
          <>
            <p className="text-xs text-ui-muted mb-3">
              Create the parcel with Steadfast directly from here — this books the consignment via their API and
              fills in the tracking code automatically.
            </p>
            <button onClick={onBook} disabled={busy} className="btn-primary w-full gap-1.5">
              <Truck size={15} /> {busy ? 'Booking…' : 'Book with Steadfast'}
            </button>
          </>
        )}
      </div>

      {/* Tracking timeline — same date-grouped layout as Steadfast's own tracker */}
      {order.courierEvents?.length > 0 && (
        <div className="mt-5 pt-4 border-t border-dashed border-ui-line">
          <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-2">Tracking history</h3>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {groupTimelineByDate(
              [...order.courierEvents]
                .sort((a, b) => new Date(b.at) - new Date(a.at))
                .map((ev) => ({ at: ev.at, label: ev.message }))
            ).map((group) => (
              <div key={group.dateLabel}>
                <div className="text-[11px] font-semibold text-ui-ink mb-1.5">{group.dateLabel}</div>
                <ul className="space-y-2">
                  {group.entries.map((entry, idx) => (
                    <li key={idx} className="flex gap-2.5">
                      <span className="text-[11px] font-mono text-ui-faint w-14 shrink-0 pt-px">{formatTime(entry.at)}</span>
                      <span className="flex-1 min-w-0 text-xs text-ui-ink flex items-start gap-1.5">
                        <MapPin size={11} className="text-ui-muted shrink-0 mt-0.5" />
                        {entry.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ui-muted shrink-0">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
