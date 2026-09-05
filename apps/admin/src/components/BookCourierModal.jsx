import { useState } from 'react';
import { Truck, X, CheckCircle2, Loader2 } from 'lucide-react';
import { bookSteadfastParcel } from '../api/client';
import { formatMoney } from '../utils/format';

// Shown right after an order is created manually in the admin. Lets the
// admin preview the recipient + COD amount and decide, on the spot, whether
// to book the Steadfast consignment now or leave it for later.
export default function BookCourierModal({ order, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState(null);

  const { customer, pricing, weightKg } = order;
  const area = [customer.thana, customer.zilla].filter(Boolean).join(', ') || '—';

  const handleBook = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await bookSteadfastParcel(order._id);
      setBooked(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to book with Steadfast.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={() => !busy && onDone(booked)} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-floating max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <h2 className="font-display text-lg text-ui-ink flex items-center gap-2">
            <Truck size={19} className="text-ui-brand" />
            {booked ? 'Booked with Steadfast' : 'Order created'}
          </h2>
          <button
            onClick={() => !busy && onDone(booked)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-ui-muted hover:bg-ui-surfaceAlt"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {!booked ? (
            <>
              <p className="text-sm text-ui-muted mb-4">
                <span className="font-mono text-ui-ink">{order.orderNumber}</span> was saved. Book it with Steadfast
                now, or skip and do it later from the order page.
              </p>

              <div className="rounded-xl border border-ui-line bg-ui-bg/60 p-4 space-y-1.5 text-sm mb-4">
                <Row label="Recipient" value={customer.name} />
                <Row label="Phone" value={customer.phone} mono />
                <Row label="Address" value={customer.address || '—'} />
                <Row label="Area" value={area} />
                <Row label="Weight" value={`${weightKg ?? 0.5} KG`} />
                <div className="flex justify-between pt-1.5 mt-1.5 border-t border-dashed border-ui-line">
                  <span className="text-ui-muted">Cash on Delivery</span>
                  <span className="font-mono font-semibold text-ui-brand">{formatMoney(pricing?.due)}</span>
                </div>
              </div>

              {error && (
                <div className="mb-4 border border-ui-rust/40 bg-ui-rust/10 text-ui-rust text-sm px-3 py-2 rounded-xl">
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button onClick={handleBook} disabled={busy} className="btn-primary flex-1 gap-1.5">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
                  {busy ? 'Booking…' : 'Book with Steadfast'}
                </button>
                <button onClick={() => onDone(null)} disabled={busy} className="btn-secondary flex-1">
                  Not now
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-ui-brand/30 bg-ui-brand/5 p-4 text-sm space-y-1.5 mb-4">
                <div className="flex items-center gap-2 text-ui-brand font-medium mb-1">
                  <CheckCircle2 size={16} /> Consignment created
                </div>
                <Row label="Consignment ID" value={booked.courier?.consignmentId} mono />
                <Row label="Tracking code" value={booked.courier?.trackingCode || '—'} mono />
              </div>
              <button onClick={() => onDone(booked)} className="btn-primary w-full">
                Go to order
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ui-muted shrink-0">{label}</span>
      <span className={`text-right text-ui-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
