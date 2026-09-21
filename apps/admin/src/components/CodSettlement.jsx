import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HandCoins, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { getCourierSettlement, syncCourierPayouts } from '../api/client';
import { formatMoney, formatDate } from '../utils/format';

// Cash-on-delivery money owed by Steadfast: delivered parcels whose COD has not
// shown up in a paid payout yet, versus what has been paid out. Orders are
// marked "COD received" automatically when a paid payout contains them.
export default function CodSettlement() {
  const [data, setData] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    getCourierSettlement()
      .then(setData)
      .catch(() => setData({ awaiting: { count: 0, amount: 0, orders: [] }, settled: { count: 0, amount: 0 }, received: { payouts: 0, net: 0 }, lastSyncAt: null }));
  }, []);

  useEffect(load, [load]);

  const check = async () => {
    setSyncing(true);
    setNote('');
    try {
      const res = await syncCourierPayouts();
      setData(res);
      const n = res.summary?.newlySettled || 0;
      setNote(n > 0 ? `${n} order${n === 1 ? '' : 's'} marked as paid out.` : 'No new payouts for your orders.');
    } catch {
      /* surfaced globally via the ErrorModal */
    } finally {
      setSyncing(false);
    }
  };

  if (!data) return null;
  const { awaiting, settled, received } = data;

  return (
    <section className="card p-4 sm:p-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-display font-bold text-ui-ink flex items-center gap-2">
          <HandCoins size={16} className="text-ui-brand" /> COD settlement
        </h2>
        <button type="button" onClick={check} disabled={syncing} className="btn-secondary text-xs py-1 px-2.5 gap-1">
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Checking…' : 'Check for payouts'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
            <Clock size={13} /> Waiting for payout
          </div>
          <div className="font-display font-bold text-xl text-ui-ink mt-1">{formatMoney(awaiting.amount)}</div>
          <div className="text-xs text-ui-muted">{awaiting.count} delivered parcel{awaiting.count === 1 ? '' : 's'} · before Steadfast’s fees</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 size={13} /> Paid out
          </div>
          <div className="font-display font-bold text-xl text-ui-ink mt-1">{formatMoney(settled.amount)}</div>
          <div className="text-xs text-ui-muted">{settled.count} of your orders settled</div>
        </div>
        <div className="rounded-xl border border-ui-line bg-ui-bg/60 p-3">
          <div className="text-xs text-ui-muted font-medium">Received from Steadfast (net)</div>
          <div className="font-display font-bold text-xl text-ui-ink mt-1">{formatMoney(received.net)}</div>
          <div className="text-xs text-ui-muted">
            {received.payouts} payout{received.payouts === 1 ? '' : 's'}
            {received.lastPaidAt ? ` · last ${formatDate(received.lastPaidAt)}` : ''}
          </div>
        </div>
      </div>

      {note && <p className="text-xs text-ui-muted mt-3">{note}</p>}

      {awaiting.orders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs uppercase tracking-wide text-ui-muted mb-1.5">Delivered, not paid out yet (oldest first)</h3>
          <ul className="divide-y divide-ui-line">
            {awaiting.orders.map((o) => (
              <li key={o._id} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                <Link to={`/orders/${o._id}`} className="font-mono text-ui-brand hover:underline">{o.orderNumber}</Link>
                <span className="text-xs text-ui-muted truncate flex-1 min-w-0">{o.customer?.name}</span>
                <span className="font-mono text-ui-ink">{formatMoney(o.courier?.codAmount)}</span>
              </li>
            ))}
          </ul>
          {awaiting.count > awaiting.orders.length && (
            <p className="text-xs text-ui-muted mt-1">and {awaiting.count - awaiting.orders.length} more</p>
          )}
        </div>
      )}
      <p className="text-[11px] text-ui-faint mt-3">
        Checked automatically every few hours{data.lastSyncAt ? `; last check ${formatDate(data.lastSyncAt)}` : ''}. Parcels booked by hand in the Steadfast portal aren’t tracked here.
      </p>
    </section>
  );
}
