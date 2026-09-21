import { useEffect, useState } from 'react';
import PickupRequestModal from './PickupRequestModal';
import CodSettlement from './CodSettlement';
import { Link } from 'react-router-dom';
import { Truck, Banknote, Undo2 } from 'lucide-react';
import { getCourierPayouts, getCourierReturns } from '../api/client';
import { formatMoney, formatDate } from '../utils/format';

const STATUS_TONE = {
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial_delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-sky-50 text-sky-700 border-sky-200',
  in_review: 'bg-slate-100 text-slate-600 border-slate-200',
  hold: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-ui-rust border-red-200',
  exceptional: 'bg-red-50 text-ui-rust border-red-200',
};
const toneFor = (s) => {
  const key = String(s || '').toLowerCase();
  if (STATUS_TONE[key]) return STATUS_TONE[key];
  if (key.endsWith('_approval_pending')) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};
const pretty = (s) => String(s || 'unknown').replace(/_/g, ' ');

function Card({ icon: Icon, title, children, action }) {
  return (
    <section className="card p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-display font-bold text-ui-ink flex items-center gap-2">
          <Icon size={16} className="text-ui-brand" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Dashboard section built from the Steadfast account: where booked parcels
// stand, the latest payouts and the return requests. All read-only.
export default function CourierInsights({ courierByStatus = {} }) {
  const [payouts, setPayouts] = useState(null);
  const [returns, setReturns] = useState(null);
  const [pickupOpen, setPickupOpen] = useState(false);

  useEffect(() => {
    getCourierPayouts()
      .then((d) => setPayouts(d.payments.slice(0, 5)))
      .catch(() => setPayouts([]));
    getCourierReturns()
      .then((d) => setReturns(d.returns.slice(0, 5)))
      .catch(() => setReturns([]));
  }, []);

  const statuses = Object.entries(courierByStatus).sort((a, b) => b[1] - a[1]);
  const totalParcels = statuses.reduce((n, [, c]) => n + c, 0);

  return (
    <>
    {pickupOpen && <PickupRequestModal onClose={() => setPickupOpen(false)} />}
    <div className="mb-4 sm:mb-5">
      <CodSettlement />
    </div>
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
      <Card
        icon={Truck}
        title="Parcels by courier status"
        action={
          <button type="button" onClick={() => setPickupOpen(true)} className="btn-secondary text-xs py-1 px-2.5 gap-1">
            <Truck size={12} /> Request pickup
          </button>
        }
      >
        {totalParcels === 0 ? (
          <p className="text-xs text-ui-muted">No parcel has been booked with Steadfast yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {statuses.map(([s, c]) => (
              <li key={s} className="flex items-center justify-between gap-2 text-sm">
                <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${toneFor(s)}`}>{pretty(s)}</span>
                <span className="font-mono text-ui-ink">{c}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card icon={Banknote} title="Recent payouts">
        {payouts === null ? (
          <p className="text-xs text-ui-muted">Loading…</p>
        ) : payouts.length === 0 ? (
          <p className="text-xs text-ui-muted">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-ui-line">
            {payouts.map((p) => (
              <li key={p.payment_id} className="py-2 text-sm min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ui-muted">{p.payment_id}</span>
                  <span className="font-mono font-medium text-ui-ink">{formatMoney(p.total ?? p.amount)}</span>
                </div>
                <div className="text-xs text-ui-muted">
                  {p.method || '—'} · {p.status_label || ''} · {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card icon={Undo2} title="Return requests">
        {returns === null ? (
          <p className="text-xs text-ui-muted">Loading…</p>
        ) : returns.length === 0 ? (
          <p className="text-xs text-ui-muted">No return requests.</p>
        ) : (
          <ul className="divide-y divide-ui-line">
            {returns.map((r) => (
              <li key={r.id} className="py-2 text-sm min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-ui-ink">{r.consignment?.recipient_name || `Consignment ${r.consignment_id}`}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-medium ${toneFor(r.status)}`}>
                    {pretty(r.status)}
                  </span>
                </div>
                <div className="text-xs text-ui-muted truncate min-w-0">
                  {r.consignment?.invoice ? (
                    <Link to={`/orders?search=${encodeURIComponent(r.consignment.invoice)}`} className="text-ui-brand underline">
                      {r.consignment.invoice}
                    </Link>
                  ) : null}
                  {r.reason ? ` · ${r.reason}` : ''} · {formatDate(r.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
    </>
  );
}
